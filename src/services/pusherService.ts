import Pusher from 'pusher-js';

export interface PusherConfig {
  key: string;
  cluster: string;
}

export class PusherService {
  private pusher: Pusher;
  private channels: Map<string, any> = new Map();

  constructor(config: PusherConfig) {
    this.pusher = new Pusher(config.key, {
      cluster: config.cluster,
      forceTLS: true,
    });
    console.log('[PusherService] Initialized with key:', config.key);
  }

  /**
   * Subscribe to a channel and return a bindable object
   */
  subscribe(channelName: string): { bind: (event: string, callback: (data: any) => void) => void } {
    if (this.channels.has(channelName)) {
      return this.channels.get(channelName);
    }

    const channel = this.pusher.subscribe(channelName);
    this.channels.set(channelName, channel);
    console.log(`[PusherService] Subscribed to channel: ${channelName}`);
    
    return channel;
  }

  /**
   * Unsubscribe from a channel
   */
  unsubscribe(channelName: string): void {
    if (this.channels.has(channelName)) {
      this.pusher.unsubscribe(channelName);
      this.channels.delete(channelName);
      console.log(`[PusherService] Unsubscribed from channel: ${channelName}`);
    }
  }

  /**
   * Disconnect from Pusher
   */
  disconnect(): void {
    this.pusher.disconnect();
    this.channels.clear();
    console.log('[PusherService] Disconnected');
  }
}

let instance: PusherService | null = null;

export function getPusherService(): PusherService {
  if (!instance) {
    instance = new PusherService({
      key: import.meta.env.VITE_PUSHER_KEY || 'local-dev',
      cluster: import.meta.env.VITE_PUSHER_CLUSTER || 'mt1',
    });
  }
  return instance;
}
