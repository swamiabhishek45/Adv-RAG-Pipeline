import { MemoryClient } from "mem0ai";
import { config } from "./config";

let memoryInstance: MemoryClient | null = null;

export function getMemoryInstance() {
  if (!memoryInstance) {
    memoryInstance = new MemoryClient({
      apiKey: config.mem0ApiKey || "your-api-key-here"
    });
  }
  return memoryInstance;
}

export async function getUserMemories(userId: string, query: string): Promise<string[]> {
  const memory = getMemoryInstance();
  try {
    const response = await memory.search(query, {
      filters: { user_id: userId }
    });
    if (!response || !Array.isArray(response.results)) {
      return [];
    }
    return response.results.map((r: any) => r.memory).filter(Boolean);
  } catch (error) {
    console.error("Error retrieving user memories:", error);
    return [];
  }
}

export async function addUserMemory(userId: string, content: string): Promise<void> {
  const memory = getMemoryInstance();
  try {
    await memory.add([{ role: "user", content }], { userId });
  } catch (error) {
    console.error("Error adding user memory:", error);
  }
}
