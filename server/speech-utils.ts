import * as fs from "fs";

export async function speechToText(audioFilePath: string): Promise<string> {
  const formData = new FormData();
  const audioBuffer = fs.readFileSync(audioFilePath);
  const blob = new Blob([audioBuffer], { type: "audio/wav" });
  formData.append("file", blob, "audio.wav");
  formData.append("model", "whisper-1");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  const data = await response.json();
  return data.text;
}