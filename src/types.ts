export interface ReceiptItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export interface Receipt {
  items: ReceiptItem[];
  tax: number;
  tip: number;
  total: number;
  currency: string;
}

export interface Assignment {
  itemId: string;
  personName: string;
  share: number; // 1 means full item, 0.5 means half, etc.
}

export interface PersonSummary {
  name: string;
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  items: {
    itemName: string;
    cost: number;
  }[];
}

export interface Message {
  role: 'user' | 'model';
  content: string;
}
