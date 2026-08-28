/**
 * QuizFeedback 组件
 * 正确/错误反馈动画
 */

import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import styles from './QuizFeedback.module.css';

interface QuizFeedbackProps {
  isCorrect: boolean;
  correctAnswer: string;
  streak?: number;
  onContinue: () => void;
}

export const QuizFeedback: React.FC<QuizFeedbackProps> = ({
  isCorrect,
  correctAnswer,
  streak = 0,
  onContinue,
}) => {
  // 自动继续
  useEffect(() => {
    const timer = setTimeout(onContinue, 3800);
    return () => clearTimeout(timer);
  }, [onContinue]);

  return (
    <motion.div
      className={`${styles.container} ${isCorrect ? styles.correct : styles.wrong}`}
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
    >
      {/* 图标 */}
      <motion.div
        className={styles.icon}
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 400 }}
      >
        {isCorrect ? '🎉' : '😅'}
      </motion.div>

      {/* 标题 */}
      <motion.h2
        className={styles.title}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        {isCorrect ? '找对啦！' : '没关系，我们学会它！'}
      </motion.h2>

      {/* 描述 */}
      <motion.p
        className={styles.description}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        {isCorrect 
          ? `获得 1 颗学习星${streak >= 2 ? `，已经连续答对 ${streak} 题！` : '，魔力 +3'}`
          : `正确答案是：${correctAnswer}。先读一遍，再继续。`
        }
      </motion.p>

      {/* 粒子效果 (仅正确时) */}
      {isCorrect && (
        <div className={styles.particles}>
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className={styles.particle}
              initial={{
                x: 0,
                y: 0,
                scale: 0,
              }}
              animate={{
                x: (Math.random() - 0.5) * 200,
                y: (Math.random() - 0.5) * 200,
                scale: [0, 1, 0],
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: 1,
                delay: Math.random() * 0.3,
              }}
            >
              {['⭐', '✨', '💫', '🌟'][i % 4]}
            </motion.div>
          ))}
        </div>
      )}

      {/* 点击继续 */}
      <motion.button
        className={styles.continueBtn}
        onClick={onContinue}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        我学会了，继续
        <ArrowRight size={20} aria-hidden="true" />
      </motion.button>
    </motion.div>
  );
};

export default QuizFeedback;
