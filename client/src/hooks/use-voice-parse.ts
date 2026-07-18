import { useMutation } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

export function useVoiceParse() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (audioBlob: Blob) => {
      // Convert blob to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
      });
      reader.readAsDataURL(audioBlob);
      const audioBase64 = await base64Promise;

      const res = await fetch(api.voice.parse.path, {
        method: api.voice.parse.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: audioBase64 }),
      });

      if (!res.ok) throw new Error("Failed to parse voice input");
      return api.voice.parse.responses[200].parse(await res.json());
    },
    onError: (error) => {
      toast({
        title: "Voice Parse Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
