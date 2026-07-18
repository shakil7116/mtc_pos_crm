import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

export async function convertWebmToWav(inputPath: string, outputPath: string): Promise<void> {
  await execAsync(`ffmpeg -i ${inputPath} ${outputPath}`);
}