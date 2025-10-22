export {};

declare global {
  interface Window {
    agentflow?: {
      version: string;
    };
  }
}
