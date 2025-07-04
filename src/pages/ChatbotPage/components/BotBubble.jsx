import chatbotImg from '../../../assets/images/chatbotImg.png';

export default function BotBubble({ message, isLoading }) {
  return (
    <div className="flex items-start gap-2">
      <img src={chatbotImg} alt="플밍이" className="w-[33px] h-[33px] mt-1 shrink-0" />

      <div className="flex flex-col mt-1.5">
        <span className="body-medium text-[var(--color-black)] font-500 mb-4">상담사 요플밍</span>

        <div
          className="bg-white body-medium text-[var(--color-black)] font-500
            shadow-[0_0_6px_rgba(0,0,0,0.08)]
            rounded-br-[16px] rounded-bl-[16px] rounded-tr-[16px]
            px-4 py-3 max-w-[240px] w-fit whitespace-pre-line min-w-[200px]"
          style={{ borderTopLeftRadius: 0 }}
        >
          <div className="flex items-start gap-2">
            <span className="whitespace-pre-line">
              {isLoading && !message?.trim() ? '플밍이가 생각 중이에요' : message}
            </span>

            {isLoading && !message?.trim() && (
              <div className="flex gap-[4px] h-[8px] mt-[6px]">
                <span className="w-[8px] h-[8px] bg-[var(--color-pink-700)] rounded-full animate-blink" />
                <span className="w-[8px] h-[8px] bg-[var(--color-pink-700)] rounded-full animate-blink animate-blink-delay-200" />
                <span className="w-[8px] h-[8px] bg-[var(--color-pink-700)] rounded-full animate-blink animate-blink-delay-400" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
