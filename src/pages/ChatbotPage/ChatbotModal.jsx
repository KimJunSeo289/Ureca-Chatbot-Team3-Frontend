import { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';

import ChatbotMenuModal from './components/ChatbotMenuModal';
import ChatbotHeader from './components/ChatbotHeader';
import ChatbotToast from './components/ChatbotToast';
import ChatbotNoticeBar from './components/ChatbotNoticeBar';
import ChatbotInput from './components/ChatbotInput';
import ChatMessages from './components/ChatMessage';
import ChatbotQuickQuestionBubble from './components/ChatbotQuickQuestionBubble';
import { getRedirectResponse } from './utils/chatbotRedirectHelper';
import { getSocket, resetSocket } from '../../utils/socket';

export default function ChatbotModal({ onClose }) {
  const [message, setMessage] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [messages, setMessages] = useState([]);
  const [faqList, setFaqList] = useState([]);
  const [userId, setUserId] = useState(null);

  const sessionIdRef = useRef(null);
  const tempMessageIdRef = useRef(null);
  const tempContentRef = useRef('');
  const initializedRef = useRef(false);
  const socketRef = useRef(null);

  const getOrCreateSessionId = (userId) => {
    if (userId) return `user_${userId}`;
    let sessionId = localStorage.getItem('chat-session-id');
    if (!sessionId) {
      sessionId = 'client_' + Date.now();
      localStorage.setItem('chat-session-id', sessionId);
    }
    return sessionId;
  };

  const initializeGreetingAndFAQ = async () => {
    try {
      const response = await axios.get('/api/faq', { withCredentials: true });

      // 백엔드에서 { success: true, data: [questions] } 형태로 오는 것을 처리
      const allFaqs = response.data.success ? response.data.data || [] : response.data || [];

      setFaqList(allFaqs);

      const shuffled = allFaqs.sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 4);

      let nickname = '';
      try {
        const profileRes = await axios.get('/api/auth/profile', { withCredentials: true });
        nickname = profileRes.data?.data?.nickname || '';
      } catch (e) {}

      const greetingText = nickname
        ? `반가워요, ${nickname}님! 🤹\n저는 요플랜의 AI 챗봇, 요플밍이에요.\n데이터, 통화, 예산까지 딱 맞는 요금제를 똑똑하게 찾아드릴게요.\n궁금한 걸 채팅창에 말씀해주세요! ✨`
        : `반가워요! 🤹 저는 요플랜의 AI 챗봇, 요플밍이에요.\n데이터, 통화, 예산까지 딱 맞는 요금제를 똑똑하게 찾아드릴게요.\n궁금한 걸 채팅창에 말씀해주세요! ✨`;

      const quickText = `이런 질문은 어떠세요?\n- ${selected.join('\n- ')}`;

      socketRef.current?.emit('stream-start', { role: 'assistant', content: greetingText });
      socketRef.current?.emit('stream-end', {
        message: { role: 'assistant', content: greetingText, type: 'text' },
      });

      setTimeout(() => {
        socketRef.current?.emit('stream-start', { role: 'assistant', content: quickText });
        socketRef.current?.emit('stream-end', {
          message: { role: 'assistant', content: quickText, type: 'text' },
        });
      }, 300);

      setMessages([
        { id: 'greeting', type: 'bot', content: greetingText, role: 'assistant' },
        {
          id: 'quick-questions',
          type: 'bot',
          content: (
            <ChatbotQuickQuestionBubble onSelect={handleQuickQuestion} questions={selected} />
          ),
          role: 'assistant',
        },
      ]);
    } catch (err) {
      console.error('❌ 초기 인사말 구성 실패:', err);
    }
  };

  useEffect(() => {
    setIsVisible(true);
    let tempUserId = null;

    const fetchUserAndConnectSocket = async () => {
      try {
        const profileRes = await axios.get('/api/auth/profile', { withCredentials: true });
        tempUserId = profileRes.data?.data?._id || null;
        setUserId(tempUserId);
      } catch (e) {}

      const sessionId = getOrCreateSessionId(tempUserId);
      sessionIdRef.current = sessionId;

      const socket = getSocket(sessionId, tempUserId);
      socketRef.current = socket;

      // ✅ 기존 리스너 제거 (중복 방지)
      socket.off('stream-start');
      socket.off('stream-chunk');
      socket.off('stream-end');
      socket.off('error');

      // ✅ 새 리스너 등록
      socket.on('stream-start', ({ messageId }) => {
        tempMessageIdRef.current = messageId;
        tempContentRef.current = '';
        setMessages((prev) => [
          ...prev,
          { id: messageId, type: 'bot', content: '', isLoading: true },
        ]);
      });

      socket.on('stream-chunk', (chunk) => {
        tempContentRef.current += chunk;
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === tempMessageIdRef.current ? { ...msg, content: tempContentRef.current } : msg
          )
        );
      });

      socket.on('stream-end', ({ message }) => {
        const finalMessage = {
          ...(message || { content: '응답을 완료했어요.' }),
          id: message?.id || tempMessageIdRef.current,
          type: message?.role === 'assistant' ? 'bot' : 'user',
          isLoading: false,
        };
        setMessages((prev) => prev.map((msg) => (msg.id === finalMessage.id ? finalMessage : msg)));
        tempMessageIdRef.current = null;
        tempContentRef.current = '';
      });

      socket.on('error', ({ message }) => {
        setMessages((prev) => [...prev, { type: 'bot', content: `❌ 오류: ${message}` }]);
      });

      try {
        const res = tempUserId
          ? await axios.get(`/api/conversations?userId=${tempUserId}`)
          : await axios.get(`/api/conversations/${sessionId}`);

        const loadedMessages = (res.data.messages || [])
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
          .map((msg) => ({
            id: msg._id,
            type: msg.role === 'user' ? 'user' : 'bot',
            content: msg.content,
            timestamp: msg.timestamp,
            role: msg.role,
            label: msg.label || null,
            route: msg.route || null,
          }));

        if (loadedMessages.length === 0 && !initializedRef.current) {
          initializedRef.current = true;
          initializeGreetingAndFAQ();
        } else {
          setMessages(loadedMessages);
        }
      } catch (err) {
        if (err.response?.status === 404 && !initializedRef.current) {
          initializedRef.current = true;
          initializeGreetingAndFAQ();
        } else {
          console.warn('대화 불러오기 실패:', err.message);
        }
      }
    };

    fetchUserAndConnectSocket();

    const toastTimer = setTimeout(() => setShowToast(true), 400);
    const hideToast = setTimeout(() => setShowToast(false), 3400);

    return () => {
      clearTimeout(toastTimer);
      clearTimeout(hideToast);

      const socket = socketRef.current;
      if (socket) {
        socket.off('stream-start');
        socket.off('stream-chunk');
        socket.off('stream-end');
        socket.off('error');
      }

      resetSocket();
    };
  }, []);

  const sendMessage = useCallback((text) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    const userMsg = { type: 'user', content: trimmedText };
    setMessages((prev) => [...prev, userMsg]);
    setMessage('');

    const redirectMsg = getRedirectResponse(trimmedText);
    if (redirectMsg) {
      const redirectId = `redirect-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: redirectId,
          type: 'bot',
          role: 'assistant',
          content: redirectMsg.content,
          label: redirectMsg.label,
          route: redirectMsg.route,
        },
      ]);

      socketRef.current?.emit('stream-end', {
        message: {
          role: 'assistant',
          content: redirectMsg.content,
          type: 'redirect',
          label: redirectMsg.label,
          route: redirectMsg.route,
        },
        userMessage: {
          role: 'user',
          content: trimmedText,
          type: 'text',
          timestamp: new Date().toISOString(),
        },
      });

      return;
    }

    if (socketRef.current?.connected) {
      socketRef.current.emit('user-message', trimmedText);
    } else {
      setMessages((prev) => [...prev, { type: 'bot', content: '❌ 소켓 연결이 안 되어 있어요.' }]);
    }
  }, []);

  const handleSend = () => {
    if (!message.trim()) return;
    sendMessage(message.trim());
  };

  const handleQuickQuestion = useCallback(
    (text) => {
      sendMessage(text.trim());
    },
    [sendMessage]
  );

  const clearConversation = async () => {
    try {
      const sessionId = sessionIdRef.current;
      const params = userId ? { userId } : { sessionId };

      await axios.delete('/api/conversations', { params });
      setMessages([]);
      initializeGreetingAndFAQ();
    } catch (err) {
      console.error('❌ 대화 초기화 실패:', err);
    }
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => onClose(), 300);
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-auto" onClick={handleClose}>
      <div className="max-w-[1440px] w-full h-full mx-auto relative">
        <div
          className={`absolute right-8 top-1/2 -translate-y-1/2
            w-[360px] max-h-[90vh] h-full
            bg-[var(--color-gray-200)] border-[3px] border-[var(--color-gray-700)]
            rounded-[20px] shadow-xl pointer-events-auto
            overflow-hidden flex flex-col
            transition-all duration-300 ease-in-out
            ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {showMenu && (
            <ChatbotMenuModal
              onClose={() => setShowMenu(false)}
              onClearConversation={clearConversation}
            />
          )}
          <ChatbotToast visible={showToast} />
          <ChatbotHeader onClose={handleClose} onOpenMenu={() => setShowMenu(true)} />
          <ChatbotNoticeBar />
          <ChatMessages messages={messages} onQuickQuestionSelect={handleQuickQuestion} />
          <ChatbotInput message={message} setMessage={setMessage} onSend={handleSend} />
        </div>
      </div>
    </div>
  );
}
