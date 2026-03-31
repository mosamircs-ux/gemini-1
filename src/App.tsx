import React, { useState, useRef, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Send, 
  User, 
  Receipt as ReceiptIcon, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Loader2,
  ChevronRight,
  Users,
  DollarSign
} from 'lucide-react';
import { cn } from './lib/utils';
import { Receipt, ReceiptItem, Assignment, PersonSummary, Message } from './types';
import { parseReceipt, interpretCommand, IntentAssignment } from './services/gemini';

export default function App() {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsParsing(true);
    setError(null);
    
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const parsedReceipt = await parseReceipt(base64, file.type);
        setReceipt(parsedReceipt);
        setIsParsing(false);
        setMessages([{
          role: 'model',
          content: `I've parsed the receipt! Total is ${parsedReceipt.currency}${parsedReceipt.total.toFixed(2)}. Who had what? You can say things like "Alice had the burger" or "Bob and Charlie shared the fries".`
        }]);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setError("Failed to parse receipt. Please try again.");
      setIsParsing(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'image/*': [] },
    multiple: false 
  } as any);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || !receipt || isProcessing) return;

    const userMessage = inputValue.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setInputValue('');
    setIsProcessing(true);

    try {
      const intents = await interpretCommand(userMessage, receipt.items);
      
      if (intents.length === 0) {
        setMessages(prev => [...prev, { 
          role: 'model', 
          content: "I couldn't identify any assignments from that. Could you be more specific? For example, 'John had the pizza'." 
        }]);
      } else {
        // Update assignments
        const newAssignments: Assignment[] = [];
        
        intents.forEach(intent => {
          const item = receipt.items.find(i => 
            i.name.toLowerCase().includes(intent.itemName.toLowerCase()) ||
            intent.itemName.toLowerCase().includes(i.name.toLowerCase())
          );
          
          if (item) {
            newAssignments.push({
              itemId: item.id,
              personName: intent.personName,
              share: intent.share
            });
          }
        });

        if (newAssignments.length > 0) {
          setAssignments(prev => [...prev, ...newAssignments]);
          setMessages(prev => [...prev, { 
            role: 'model', 
            content: `Got it! I've assigned those items. Anything else?` 
          }]);
        } else {
          setMessages(prev => [...prev, { 
            role: 'model', 
            content: "I found names but couldn't match the items to the receipt. Try using the exact item names from the left." 
          }]);
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'model', content: "Sorry, I had trouble processing that command." }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const calculateSummaries = (): PersonSummary[] => {
    if (!receipt) return [];

    const people = Array.from(new Set(assignments.map(a => a.personName))) as string[];
    const totalSubtotal = receipt.items.reduce((sum, item) => sum + item.price, 0);
    
    return people.map(person => {
      const personAssignments = assignments.filter(a => a.personName === person);
      const items = personAssignments.map(a => {
        const item = receipt.items.find(i => i.id === a.itemId)!;
        return {
          itemName: item.name,
          cost: item.price * a.share
        };
      });

      const subtotal = items.reduce((sum, i) => sum + i.cost, 0);
      const taxShare = totalSubtotal > 0 ? (subtotal / totalSubtotal) * receipt.tax : 0;
      const tipShare = totalSubtotal > 0 ? (subtotal / totalSubtotal) * receipt.tip : 0;
      
      return {
        name: person,
        subtotal,
        tax: taxShare,
        tip: tipShare,
        total: subtotal + taxShare + tipShare,
        items
      };
    });
  };

  const summaries = calculateSummaries();
  const unassignedItems = receipt?.items.filter(item => {
    const totalShare = assignments
      .filter(a => a.itemId === item.id)
      .reduce((sum, a) => sum + a.share, 0);
    return totalShare < 0.99; // Using 0.99 to account for floating point issues
  }) || [];

  return (
    <div className="flex flex-col h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-bottom border-[#E5E5E5] shadow-sm z-10">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-[#141414] rounded-xl flex items-center justify-center">
            <DollarSign className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">SplitSmart AI</h1>
        </div>
        {receipt && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-[#8E9299] uppercase font-bold tracking-wider">Total Bill</p>
              <p className="text-lg font-bold">{receipt.currency}{receipt.total.toFixed(2)}</p>
            </div>
            <button 
              onClick={() => { setReceipt(null); setAssignments([]); setMessages([]); }}
              className="p-2 hover:bg-[#F0F0F0] rounded-full transition-colors"
            >
              <Trash2 className="w-5 h-5 text-[#FF4444]" />
            </button>
          </div>
        )}
      </header>

      <main className="flex flex-1 overflow-hidden">
        {/* Left Pane: Receipt & Summary */}
        <div className="w-1/2 border-right border-[#E5E5E5] overflow-y-auto bg-white p-8">
          {!receipt ? (
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div 
                {...getRootProps()} 
                className={cn(
                  "w-full max-w-md p-12 border-2 border-dashed rounded-3xl transition-all cursor-pointer flex flex-col items-center gap-6",
                  isDragActive ? "border-[#141414] bg-[#F0F0F0]" : "border-[#E5E5E5] hover:border-[#141414] hover:bg-[#F9F9F9]"
                )}
              >
                <input {...getInputProps()} />
                <div className="w-20 h-20 bg-[#F0F0F0] rounded-full flex items-center justify-center">
                  {isParsing ? (
                    <Loader2 className="w-10 h-10 text-[#141414] animate-spin" />
                  ) : (
                    <Upload className="w-10 h-10 text-[#141414]" />
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-bold mb-2">Upload Receipt</h3>
                  <p className="text-[#8E9299]">Drag and drop your receipt image here, or click to browse</p>
                </div>
              </div>
              <p className="mt-8 text-sm text-[#8E9299] max-w-xs">
                Our AI will automatically extract items, prices, tax, and tip for you.
              </p>
            </div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-10"
            >
              {/* Receipt Items */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[#8E9299] flex items-center gap-2">
                    <ReceiptIcon className="w-4 h-4" /> Receipt Items
                  </h2>
                  <span className="px-3 py-1 bg-[#F0F0F0] rounded-full text-xs font-bold">
                    {receipt.items.length} Items
                  </span>
                </div>
                <div className="space-y-1">
                  {receipt.items.map((item) => {
                    const assignedShare = assignments
                      .filter(a => a.itemId === item.id)
                      .reduce((sum, a) => sum + a.share, 0);
                    const isFullyAssigned = assignedShare >= 0.99;

                    return (
                      <div 
                        key={item.id}
                        className={cn(
                          "group flex items-center justify-between p-4 rounded-2xl transition-all border border-transparent",
                          isFullyAssigned ? "bg-[#F9F9F9] opacity-60" : "hover:border-[#E5E5E5] hover:bg-[#FDFDFD]"
                        )}
                      >
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                            isFullyAssigned ? "bg-[#E5E5E5] text-[#8E9299]" : "bg-[#141414] text-white"
                          )}>
                            {item.quantity}x
                          </div>
                          <div>
                            <p className="font-bold">{item.name}</p>
                            <div className="flex gap-1 mt-1">
                              {assignments.filter(a => a.itemId === item.id).map((a, i) => (
                                <span key={i} className="text-[10px] bg-[#F0F0F0] px-2 py-0.5 rounded-full font-bold uppercase">
                                  {a.personName} {a.share < 1 ? `(${Math.round(a.share * 100)}%)` : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{receipt.currency}{item.price.toFixed(2)}</p>
                          {isFullyAssigned && (
                            <CheckCircle2 className="w-4 h-4 text-[#00C853] ml-auto mt-1" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="mt-6 pt-6 border-top border-[#F0F0F0] space-y-2">
                  <div className="flex justify-between text-sm text-[#8E9299]">
                    <span>Tax</span>
                    <span>{receipt.currency}{receipt.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-[#8E9299]">
                    <span>Tip</span>
                    <span>{receipt.currency}{receipt.tip.toFixed(2)}</span>
                  </div>
                </div>
              </section>

              {/* Summary */}
              <section>
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[#8E9299] flex items-center gap-2">
                    <Users className="w-4 h-4" /> Who Owes What
                  </h2>
                </div>
                
                {summaries.length === 0 ? (
                  <div className="bg-[#F9F9F9] p-8 rounded-3xl text-center border border-dashed border-[#E5E5E5]">
                    <p className="text-[#8E9299] text-sm">No assignments yet. Use the chat to assign items!</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {summaries.map((summary, idx) => (
                      <motion.div 
                        key={idx}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-[#141414] text-white p-6 rounded-3xl shadow-xl"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-2xl font-bold">{summary.name}</h3>
                            <p className="text-xs text-[#8E9299] uppercase font-bold tracking-widest mt-1">Total Share</p>
                          </div>
                          <div className="text-right">
                            <p className="text-3xl font-bold">{receipt.currency}{summary.total.toFixed(2)}</p>
                          </div>
                        </div>
                        
                        <div className="space-y-2 mt-6 pt-6 border-top border-white/10">
                          {summary.items.map((item, i) => (
                            <div key={i} className="flex justify-between text-xs">
                              <span className="opacity-60">{item.itemName}</span>
                              <span className="font-mono">{receipt.currency}{item.cost.toFixed(2)}</span>
                            </div>
                          ))}
                          <div className="flex justify-between text-[10px] opacity-40 pt-2 border-top border-white/5">
                            <span>Tax & Tip Share</span>
                            <span>{receipt.currency}{(summary.tax + summary.tip).toFixed(2)}</span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </section>
            </motion.div>
          )}
        </div>

        {/* Right Pane: Chat Interface */}
        <div className="w-1/2 flex flex-col bg-[#F0F2F5]">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-40">
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                  <Users className="w-8 h-8 text-[#141414]" />
                </div>
                <h3 className="text-lg font-bold">Smart Assignment Chat</h3>
                <p className="text-sm max-w-xs mt-2">
                  Once you upload a receipt, you can tell me who had what using natural language.
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: msg.role === 'user' ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "flex max-w-[85%]",
                      msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      msg.role === 'user' ? "ml-3 bg-[#141414]" : "mr-3 bg-white shadow-sm"
                    )}>
                      {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <DollarSign className="w-4 h-4 text-[#141414]" />}
                    </div>
                    <div className={cn(
                      "p-4 rounded-2xl text-sm leading-relaxed",
                      msg.role === 'user' 
                        ? "bg-[#141414] text-white rounded-tr-none" 
                        : "bg-white text-[#1A1A1A] shadow-sm rounded-tl-none border border-[#E5E5E5]"
                    )}>
                      {msg.content}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-6 bg-white border-top border-[#E5E5E5]">
            <form 
              onSubmit={handleSendMessage}
              className="relative flex items-center"
            >
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={receipt ? "e.g. Dhruv had the nachos..." : "Upload a receipt first..."}
                disabled={!receipt || isProcessing}
                className="w-full pl-6 pr-14 py-4 bg-[#F8F9FA] border border-[#E5E5E5] rounded-2xl focus:outline-none focus:border-[#141414] focus:ring-1 focus:ring-[#141414] transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!inputValue.trim() || !receipt || isProcessing}
                className="absolute right-2 p-2 bg-[#141414] text-white rounded-xl hover:bg-[#333] transition-colors disabled:opacity-50"
              >
                {isProcessing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </form>
            <div className="mt-4 flex gap-2 overflow-x-auto pb-2 no-scrollbar">
              {['Dhruv had the nachos', 'Sarah and Sue shared pizza', 'Everyone shared the fries'].map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => setInputValue(suggestion)}
                  disabled={!receipt || isProcessing}
                  className="whitespace-nowrap px-4 py-2 bg-[#F0F0F0] hover:bg-[#E5E5E5] rounded-full text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
