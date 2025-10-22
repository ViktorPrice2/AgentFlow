import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('agentflow', {
  version: '2.0.0'
});
