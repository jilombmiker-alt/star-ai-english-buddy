/**
 * ImageChoice 组件
 * 听音辨图题型 - 听音频选择正确的图片
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Apple, Banana, Bird, Cat, Citrus, Dog, Grape, Image as ImageIcon,
  Lightbulb, Music2, PawPrint, Rabbit, RefreshCw, Utensils, Volume2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { QuizItem, QuizOption } from '@/db';
import { ttsService } from '@/services/ttsService';
import { logger } from '@lark-apaas/client-toolkit/logger';
import styles from './ImageChoice.module.css';

interface ImageChoiceProps {
  question: QuizItem;
  onAnswer: (answer: string) => void;
  onHint: () => void;
}

const fallbackVisuals: Record<string, string> = {
  sings: '🐦🎵',
  flies: '🐦☁️',
  eats: '🐦🌾',
  owl: '🦉',
  rabbit: '🐰',
  bear: '🐻',
  mouse: '🐭',
  cat: '🐱',
  dog: '🐶',
};

const semanticIcons: Record<string, LucideIcon> = {
  apple: Apple,
  banana: Banana,
  orange: Citrus,
  grape: Grape,
  sings: Music2,
  flies: Bird,
  eats: Utensils,
  owl: Bird,
  rabbit: Rabbit,
  bear: PawPrint,
  mouse: PawPrint,
  cat: Cat,
  dog: Dog,
};

const isAssetPath = (value?: string): boolean => Boolean(value && /^(\/|https?:|data:image)/.test(value));

const OptionVisual: React.FC<{ option: QuizOption }> = ({ option }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const fallback = fallbackVisuals[option.value] || '🖼️';

  const label = option.text || option.value;
  const SemanticIcon = semanticIcons[option.value];

  if (option.image && isAssetPath(option.image) && !imageFailed) {
    return <>
      <img
        className={styles.realImage}
        src={option.image}
        alt={label}
        onError={() => setImageFailed(true)}
      />
      <span className={styles.visualLabel}>{label}</span>
    </>;
  }

  if (SemanticIcon) {
    return <>
      <span className={styles.svgVisual} aria-hidden="true"><SemanticIcon size={72} strokeWidth={1.8} /></span>
      <span className={styles.visualLabel}>{label}</span>
    </>;
  }

  if (option.image && !isAssetPath(option.image)) {
    return <><span className={styles.emoji} aria-hidden="true">{option.image}</span><span className={styles.visualLabel}>{label}</span></>;
  }

  if (option.image) {
    return <><span className={styles.emoji} aria-hidden="true">{fallback}</span><span className={styles.visualLabel}>{label}</span></>;
  }

  return <><ImageIcon className={styles.textOptionIcon} size={34} aria-hidden="true" /><span className={styles.optionText}>{option.text}</span></>;
};

export const ImageChoice: React.FC<ImageChoiceProps> = ({
  question,
  onAnswer,
  onHint,
}) => {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [voiceLabel, setVoiceLabel] = useState(() => ttsService.getActiveVoiceLabel());
  const [hintMessage, setHintMessage] = useState<string | null>(null);

  useEffect(() => ttsService.subscribeVoices(() => {
    setVoiceLabel(ttsService.getActiveVoiceLabel());
  }), []);

  const playAudio = useCallback(async () => {
    if (!ttsService.isSupported()) return;
    setIsPlaying(true);
    ttsService.setOptions({ rate: 0.86, pitch: 1.03, lang: 'en-US' });
    try {
      await ttsService.speak(question.question);
    } catch (error) {
      logger.warn('Quiz TTS failed', error);
    } finally {
      setIsPlaying(false);
    }
  }, [question]);

  const handleChangeVoice = useCallback(() => {
    ttsService.stop();
    setIsPlaying(false);
    setVoiceLabel(ttsService.cycleFriendlyVoice());
  }, []);

  const handleSelect = useCallback((value: string) => {
    if (selectedOption) return;
    setSelectedOption(value);
    window.setTimeout(() => onAnswer(value), 300);
  }, [selectedOption, onAnswer]);

  const handleHint = useCallback(() => {
    onHint();
    setHintMessage('提示：先听开头的发音，再看每张图的动作。');
    window.setTimeout(() => setHintMessage(null), 3500);
  }, [onHint]);

  return (
    <div className={styles.container}>
      <div className={styles.questionSection}>
        <h2 className={styles.title}>听一听，选一选</h2>
        <p className={styles.instruction}>点击大喇叭听英语，再选择对应的图片</p>

        <motion.button
          className={`${styles.playBtn} ${isPlaying ? styles.playing : ''}`}
          onClick={() => void playAudio()}
          whileTap={{ scale: 0.97 }}
          disabled={isPlaying}
          aria-label={isPlaying ? '英语播放中' : '播放英语题目'}
        >
          <Volume2 className={styles.playIcon} aria-hidden="true" />
          <span className={styles.playText}>{isPlaying ? '播放中…' : '点击听音'}</span>
        </motion.button>

        <button
          type="button"
          className={styles.voiceBtn}
          onClick={handleChangeVoice}
          aria-label={`更换英语声音，当前${voiceLabel}`}
        >
          <RefreshCw size={16} aria-hidden="true" />
          声音：{voiceLabel}
        </button>
      </div>

      <div className={styles.optionsGrid} aria-label="图片选项">
        {question.options?.map((option, index) => (
          <motion.button
            key={option.value}
            className={`${styles.option} ${selectedOption === option.value ? styles.selected : ''}`}
            onClick={() => handleSelect(option.value)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            aria-label={`选项 ${index + 1}：${option.text || option.value}`}
          >
            <div className={styles.optionImage}>
              <OptionVisual option={option} />
            </div>
          </motion.button>
        ))}
      </div>

      <div className={styles.hintSection}>
        {hintMessage && (
          <motion.div
            className={styles.hintMessage}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            role="status"
          >
            {hintMessage}
          </motion.div>
        )}
        <button className={styles.hintBtn} onClick={handleHint}>
          <Lightbulb size={18} aria-hidden="true" />
          给我提示 (-5 魔力)
        </button>
      </div>
    </div>
  );
};

export default ImageChoice;
