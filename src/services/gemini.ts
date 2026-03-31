import { GoogleGenAI, Type } from "@google/genai";
import { Receipt, ReceiptItem } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function parseReceipt(base64Image: string, mimeType: string): Promise<Receipt> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Image,
              mimeType: mimeType,
            },
          },
          {
            text: "Extract all items, their quantities, and prices from this receipt. Also extract the tax, tip (if any), total, and currency. Return the data in JSON format.",
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                price: { type: Type.NUMBER },
                quantity: { type: Type.NUMBER },
              },
              required: ["name", "price", "quantity"],
            },
          },
          tax: { type: Type.NUMBER },
          tip: { type: Type.NUMBER },
          total: { type: Type.NUMBER },
          currency: { type: Type.STRING },
        },
        required: ["items", "tax", "total", "currency"],
      },
    },
  });

  const rawJson = response.text;
  const parsed = JSON.parse(rawJson);
  
  // Add IDs to items
  const itemsWithIds: ReceiptItem[] = parsed.items.map((item: any, index: number) => ({
    ...item,
    id: `item-${index}`,
  }));

  return {
    ...parsed,
    items: itemsWithIds,
    tip: parsed.tip || 0,
  };
}

export interface IntentAssignment {
  personName: string;
  itemName: string;
  share: number;
}

export async function interpretCommand(
  command: string,
  items: ReceiptItem[]
): Promise<IntentAssignment[]> {
  const itemNames = items.map(i => i.name).join(", ");
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `The user said: "${command}". 
    The available items are: ${itemNames}.
    Identify which people are assigned to which items and what their share is. 
    If multiple people share an item, split the share equally (e.g., if 2 people share, each gets 0.5).
    Return a JSON array of objects with personName, itemName, and share.
    Only return assignments for items that match or closely match the available items.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            personName: { type: Type.STRING },
            itemName: { type: Type.STRING },
            share: { type: Type.NUMBER },
          },
          required: ["personName", "itemName", "share"],
        },
      },
    },
  });

  return JSON.parse(response.text);
}
