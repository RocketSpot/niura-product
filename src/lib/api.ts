interface SendMessagePayload {
  text: string;
}

class APIClient {
  async sendMessage(host: string, payload: SendMessagePayload) {
    // 1. Start the assistant
    const startRes = await fetch(`${host}/chatgpt/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const { thread_id } = await startRes.json();

    if (!thread_id) {
      throw new Error('Assistant failed to start');
    }

    // 2. Poll for the response
    const poll = async (): Promise<string> => {
      const res = await fetch(`${host}/chatgpt/response?thread_id=${thread_id}`);
      const data = await res.json();

      if (data.status === 'pending') {
        await new Promise((r) => setTimeout(r, 1500));
        return poll();
      }

      return data.answer || '[No response]';
    };

    const answer = await poll();
    return { answer, thread_id };
  }
}

const API = new APIClient();

export default API;
