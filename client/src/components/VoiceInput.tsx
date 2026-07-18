import { useState } from "react";
import { useVoiceRecorder } from "@/replit_integrations/audio";
import { useVoiceParse } from "@/hooks/use-voice-parse";
import { Mic, Square, Loader2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ParsedVoiceItem } from "@shared/schema";

interface VoiceInputProps {
  onItemsParsed: (items: ParsedVoiceItem[]) => void;
}

export function VoiceInput({ onItemsParsed }: VoiceInputProps) {
  const recorder = useVoiceRecorder();
  const parseMutation = useVoiceParse();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleToggleRecord = async () => {
    if (recorder.state === "recording") {
      // Stop and process
      const blob = await recorder.stopRecording();
      setIsProcessing(true);
      try {
        const result = await parseMutation.mutateAsync(blob);
        onItemsParsed(result.items);
      } finally {
        setIsProcessing(false);
      }
    } else {
      // Start recording
      await recorder.startRecording();
    }
  };

  const isRecording = recorder.state === "recording";

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all">
      <div className="relative">
        {/* Pulsing effect when recording */}
        {isRecording && (
          <motion.div
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="absolute inset-0 bg-red-500 rounded-full"
          />
        )}
        
        <button
          onClick={handleToggleRecord}
          disabled={isProcessing}
          className={`
            relative z-10 flex items-center justify-center w-14 h-14 rounded-full 
            transition-all duration-300 shadow-lg
            ${isRecording 
              ? "bg-red-500 hover:bg-red-600 text-white shadow-red-500/30" 
              : isProcessing
                ? "bg-secondary text-muted-foreground cursor-wait"
                : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-primary/30 hover:scale-105"
            }
          `}
        >
          <AnimatePresence mode="wait">
            {isProcessing ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : isRecording ? (
              <Square className="w-5 h-5 fill-current" />
            ) : (
              <Mic className="w-6 h-6" />
            )}
          </AnimatePresence>
        </button>
      </div>

      <div className="mt-3 text-center">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5 justify-center">
          {isRecording ? "Listening..." : "Voice Input"}
          {!isRecording && !isProcessing && <Sparkles className="w-3.5 h-3.5 text-amber-500" />}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
          {isRecording 
            ? "Speak clearly: '5 bags of Cement at 14 riyals'" 
            : isProcessing 
              ? "AI is parsing your items..." 
              : "Click to add items by voice"}
        </p>
      </div>
    </div>
  );
}
