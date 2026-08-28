import { useMemo, useState } from 'react';
import { MessageCircle, Send, ShieldCheck, Sparkles, Star, X } from 'lucide-react';
import type { QuizItem } from '@/db';
import styles from './LearningBuddy.module.css';

interface LearningBuddyProps {
  mode: 'reader' | 'quiz';
  topic?: string;
  questionType?: QuizItem['type'];
  current?: number;
  total?: number;
  stars?: number;
  streak?: number;
  onReplay?: () => void;
  onHint?: () => void;
}

const questionTips: Record<QuizItem['type'], string> = {
  image_choice: '先听声音，再看图里的角色或动作，不用急着猜。',
  fill_blank: '把三个词分别放进句子里读一遍，听听哪一个最顺。',
  sentence_order: '先找谁在做事，再找做了什么，最后补地点或时间。',
  word_builder: '先慢慢读这个词，再按听到的顺序找字母。',
};

export const LearningBuddy: React.FC<LearningBuddyProps> = ({
  mode,
  topic,
  questionType,
  current = 1,
  total = 1,
  stars = 0,
  streak = 0,
  onReplay,
  onHint,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [lastQuestion, setLastQuestion] = useState('');

  const initialReply = useMemo(() => {
    if (mode === 'reader') {
      return `我们先听一遍${topic ? `《${topic}》` : '故事'}，再挑一句一起读。`;
    }
    return questionTips[questionType || 'image_choice'];
  }, [mode, questionType, topic]);

  const [reply, setReply] = useState(initialReply);

  const buildReply = (question: string): string => {
    const normalized = question.toLowerCase();
    if (/答案|answer|直接告诉/.test(normalized)) {
      return '我先不直接说答案。你可以再听一次，我会帮你找第一个线索。';
    }
    if (/慢|听不清|再听|声音/.test(normalized)) {
      return '好，我们慢一点。先只听第一个关键词，再看哪张图最像。';
    }
    if (/中文|意思|翻译/.test(normalized)) {
      return mode === 'reader'
        ? '可以先看中文提示，再把中文关掉，试着只读英文。'
        : '先看画面和动作猜意思，实在不确定再用提示。';
    }
    if (/为什么|练什么|怎么做|提示/.test(normalized)) {
      return mode === 'quiz'
        ? questionTips[questionType || 'image_choice']
        : '这一轮练的是听懂大意和开口模仿，不需要每个词都背下来。';
    }
    return '我听到了。先完成一个小步骤：听一遍、说一遍，再做选择。';
  };

  const ask = (question: string) => {
    const trimmed = question.trim().slice(0, 80);
    if (!trimmed) return;
    setLastQuestion(trimmed);
    setReply(buildReply(trimmed));
    setInput('');
  };

  const quickActions = mode === 'reader'
    ? [
        { label: '再听一遍', action: onReplay },
        { label: '给我中文提示', action: onHint },
        { label: '这段练什么', action: undefined },
      ]
    : [
        { label: '慢一点', action: undefined },
        { label: '给个提示', action: onHint },
        { label: '这题练什么', action: undefined },
      ];

  return (
    <section className={`${styles.host} ${styles[mode]} ${isOpen ? styles.open : ''}`} aria-label="小星智能陪练">
      <button
        type="button"
        className={styles.summary}
        onClick={() => setIsOpen(value => !value)}
        aria-expanded={isOpen}
      >
        <span className={styles.avatar} aria-hidden="true"><Sparkles size={22} /></span>
        <span className={styles.summaryText}>
          <strong>小星陪练</strong>
          <span>{isOpen ? '正在陪你学' : reply}</span>
        </span>
        {mode === 'quiz' && (
          <span className={styles.gameStats} aria-label={`第${current}题，共${total}题，获得${stars}颗星，连续答对${streak}题`}>
            <span><Star size={16} fill="currentColor" aria-hidden="true" /> {stars}</span>
            <span>连对 {streak}</span>
          </span>
        )}
        {isOpen ? <X size={20} aria-hidden="true" /> : <MessageCircle size={20} aria-hidden="true" />}
      </button>

      {isOpen && (
        <div className={styles.panel}>
          {lastQuestion && <p className={styles.childBubble}>我：{lastQuestion}</p>}
          <p className={styles.buddyBubble}><strong>小星：</strong>{reply}</p>

          <div className={styles.quickActions}>
            {quickActions.map(item => (
              <button
                type="button"
                key={item.label}
                onClick={() => {
                  item.action?.();
                  ask(item.label);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <form
            className={styles.askForm}
            onSubmit={(event) => {
              event.preventDefault();
              ask(input);
            }}
          >
            <label className={styles.srOnly} htmlFor={`buddy-question-${mode}`}>问小星一个学习问题</label>
            <input
              id={`buddy-question-${mode}`}
              value={input}
              onChange={event => setInput(event.target.value)}
              maxLength={80}
              placeholder="例如：这题在练什么？"
            />
            <button type="submit" aria-label="发送问题" disabled={!input.trim()}>
              <Send size={18} aria-hidden="true" />
            </button>
          </form>

          <p className={styles.privacyNote}>
            <ShieldCheck size={15} aria-hidden="true" />
            本地智能陪练，文字不会上传；当前是规则版，不是云端大模型。
          </p>
        </div>
      )}
    </section>
  );
};

export default LearningBuddy;
