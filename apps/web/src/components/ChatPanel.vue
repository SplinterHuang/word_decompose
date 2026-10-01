<script setup lang="ts">
import { ref } from "vue";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const messages = ref<Message[]>([
  {
    id: "1",
    role: "assistant",
    content: "你好！我是词根助手。你可以询问单词的词根、词源，或者搜索相关词汇。",
    timestamp: new Date(),
  },
]);

const inputText = ref("");

function sendMessage() {
  if (!inputText.value.trim()) return;

  const userMessage: Message = {
    id: Date.now().toString(),
    role: "user",
    content: inputText.value,
    timestamp: new Date(),
  };

  messages.value.push(userMessage);

  // Stub reply
  setTimeout(() => {
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: `收到你的消息："${inputText.value}"。聊天功能正在开发中，暂时返回占位回复。`,
      timestamp: new Date(),
    };
    messages.value.push(assistantMessage);
  }, 500);

  inputText.value = "";
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("zh-CN", { 
    hour: "2-digit", 
    minute: "2-digit" 
  });
}
</script>

<template>
  <div class="chat-panel">
    <div class="chat-header">
      <h3>词根对话</h3>
    </div>

    <div class="chat-messages">
      <div
        v-for="msg in messages"
        :key="msg.id"
        :class="['message', `message-${msg.role}`]"
      >
        <div class="message-content">
          <div class="message-text">{{ msg.content }}</div>
          <div class="message-time">{{ formatTime(msg.timestamp) }}</div>
        </div>
      </div>
    </div>

    <div class="chat-input">
      <input
        v-model="inputText"
        type="text"
        placeholder="输入消息..."
        @keyup.enter="sendMessage"
      />
      <button @click="sendMessage" :disabled="!inputText.trim()">
        发送
      </button>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f8f9fa;
}

.chat-header {
  padding: 1rem 1.5rem;
  background: white;
  border-bottom: 1px solid #ddd;
}

.chat-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #2c3e50;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.message {
  display: flex;
  max-width: 80%;
}

.message-user {
  align-self: flex-end;
}

.message-assistant {
  align-self: flex-start;
}

.message-content {
  background: white;
  border-radius: 12px;
  padding: 0.75rem 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.message-user .message-content {
  background: #4ecdc4;
  color: white;
}

.message-text {
  line-height: 1.5;
  font-size: 0.95rem;
}

.message-time {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  opacity: 0.7;
  text-align: right;
}

.chat-input {
  display: flex;
  gap: 0.5rem;
  padding: 1rem;
  background: white;
  border-top: 1px solid #ddd;
}

.chat-input input {
  flex: 1;
  padding: 0.75rem 1rem;
  min-height: 44px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 1rem;
  font-family: inherit;
}

.chat-input input:focus {
  outline: none;
  border-color: #4ecdc4;
}

.chat-input button {
  padding: 0.75rem 1.5rem;
  min-height: 44px;
  background: #4ecdc4;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.chat-input button:hover:not(:disabled) {
  background: #45b8af;
}

.chat-input button:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .chat-header {
    padding: 1rem;
  }

  .chat-header h3 {
    font-size: 1.1rem;
  }

  .chat-messages {
    padding: 0.75rem;
  }

  .message {
    max-width: 85%;
  }

  .chat-input {
    padding: 0.75rem;
  }
}

@media (max-width: 480px) {
  .chat-header {
    padding: 0.75rem 1rem;
  }

  .chat-header h3 {
    font-size: 1rem;
  }

  .message {
    max-width: 90%;
  }
}
</style>
