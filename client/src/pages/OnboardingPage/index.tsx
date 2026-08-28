/**
 * OnboardingPage 新手引导页
 * 魔法蛋孵化、Buddy 起名、魔法觉醒
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/useAppStore';
import { db, createUser } from '@/db';
import { useInitialization } from '@/hooks/useInitialization';
import { useLongPress } from '@/hooks/useLongPress';
import { MagicBackground, MagicEgg } from '@/components/onboarding';
import Loading from '@/components/common/Loading';
import Button from '@/components/common/Button';
import styles from './OnboardingPage.module.css';

type OnboardingStep = 'welcome' | 'hatching' | 'naming' | 'ready';
type EggState = 'dormant' | 'awakening' | 'cracking' | 'hatched';

const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const setCurrentUser = useAppStore((state) => state.setCurrentUser);
  const { state: initState } = useInitialization();
  const isLoading = initState.isChecking || initState.isInitializing;
  const isInitialized = initState.isComplete;

  // 引导步骤
  const [step, setStep] = useState<OnboardingStep>('welcome');
  // 蛋的状态
  const [eggState, setEggState] = useState<EggState>('dormant');
  // 表单数据
  const [userName, setUserName] = useState('');
  const [buddyName, setBuddyName] = useState('');
  // 对话文本
  const [dialogue, setDialogue] = useState('');

  // 长按孵化
  const { progress, handlers, reset: _reset } = useLongPress({ // eslint-disable-line @typescript-eslint/no-unused-vars
    duration: 3000,
    onStart: () => {
      setEggState('awakening');
      setDialogue('继续按住...感受魔法的力量...');
    },
    onProgress: (p) => {
      if (p > 0.5 && eggState === 'awakening') {
        setDialogue('快了！蛋壳在颤抖...');
      }
    },
    onComplete: () => {
      setEggState('cracking');
      setDialogue('');
    },
    onCancel: () => {
      if (eggState !== 'cracking' && eggState !== 'hatched') {
        setEggState('dormant');
        setDialogue('');
      }
    },
  });

  // 蛋孵化完成
  const handleHatched = useCallback(() => {
    setStep('naming');
    setDialogue('你好！我是你的魔法伙伴！给我起个名字吧！');
  }, []);

  // 开始孵化
  const handleStartHatching = useCallback(() => {
    setStep('hatching');
    setDialogue('长按魔法蛋，唤醒你的伙伴...');
  }, []);

  // 创建用户并开始冒险
  const handleStartAdventure = useCallback(async () => {
    if (!userName.trim()) {
      setDialogue('请告诉我你的名字~');
      return;
    }
    if (!buddyName.trim()) {
      setDialogue('给我起个名字嘛~');
      return;
    }

    try {
      const newUser = await createUser(userName.trim(), buddyName.trim());
      setCurrentUser(newUser.id);
      
      setStep('ready');
      setDialogue(`太棒了！${buddyName}准备好和你一起冒险了！`);
      
      // 延迟跳转
      setTimeout(() => {
        navigate('/home');
      }, 2000);
    } catch (error) {
      console.error('Failed to create user:', error);
      setDialogue('哎呀，出错了，再试一次吧~');
    }
  }, [userName, buddyName, setCurrentUser, navigate]);

  // 跳过引导
  const handleSkip = useCallback(async () => {
    try {
      const newUser = await createUser('小魔法师', '小精灵');
      setCurrentUser(newUser.id);
      navigate('/home');
    } catch (error) {
      console.error('Failed to create default user:', error);
    }
  }, [setCurrentUser, navigate]);

  // 检查是否已有用户 (必须在条件返回之前)
  useEffect(() => {
    const checkExistingUser = async () => {
      const userCount = await db.users.count();
      if (userCount > 0) {
        const lastUser = await db.users.orderBy('createdAt').reverse().first();
        if (lastUser) {
          setCurrentUser(lastUser.id);
          navigate('/home');
        }
      }
    };
    if (isInitialized) {
      checkExistingUser();
    }
  }, [isInitialized, setCurrentUser, navigate]);

  // 加载中
  if (isLoading) {
    return <Loading />;
  }

  return (
    <div className={styles.container}>
      {/* 魔法背景 */}
      <MagicBackground intensity={step === 'hatching' ? 0.8 : 0.5} />

      {/* 内容区域 */}
      <div className={styles.content}>
        {/* 标题 */}
        <AnimatePresence mode="wait">
          {step === 'welcome' && (
            <motion.div
              key="welcome-title"
              className={styles.titleSection}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <h1 className={styles.title}>Magic English Buddy</h1>
              <p className={styles.subtitle}>你的魔法英语伙伴</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 魔法蛋 / Buddy */}
        <div className={styles.eggContainer} {...(step === 'hatching' ? handlers : {})}>
          <MagicEgg
            state={eggState}
            holdProgress={progress}
            onHatched={handleHatched}
            onClick={step === 'welcome' ? handleStartHatching : undefined}
          />
        </div>

        {/* 对话框 */}
        <AnimatePresence mode="wait">
          {dialogue && (
            <motion.div
              key="dialogue"
              className={styles.dialogue}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <p>{dialogue}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 命名表单 */}
        <AnimatePresence mode="wait">
          {step === 'naming' && (
            <motion.div
              key="naming-form"
              className={styles.namingForm}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <div className={styles.inputGroup}>
                <label htmlFor="userName">你的名字</label>
                <input
                  id="userName"
                  type="text"
                  placeholder="输入你的名字..."
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  maxLength={20}
                  autoComplete="off"
                />
              </div>
              <div className={styles.inputGroup}>
                <label htmlFor="buddyName">伙伴的名字</label>
                <input
                  id="buddyName"
                  type="text"
                  placeholder="给你的伙伴起个名字..."
                  value={buddyName}
                  onChange={(e) => setBuddyName(e.target.value)}
                  maxLength={20}
                  autoComplete="off"
                />
              </div>
              <Button
                variant="primary"
                onClick={handleStartAdventure}
                disabled={!userName.trim() || !buddyName.trim()}
                className={styles.adventureBtn}
              >
                开始冒险 ✨
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 准备完成 */}
        <AnimatePresence mode="wait">
          {step === 'ready' && (
            <motion.div
              key="ready"
              className={styles.readySection}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div className={styles.sparkles}>✨🎉✨</div>
              <p className={styles.readyText}>准备进入魔法世界...</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 底部操作 */}
        <div className={styles.footer}>
          {step === 'welcome' && (
            <motion.div
              className={styles.actions}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <Button variant="primary" onClick={handleStartHatching}>
                唤醒我的伙伴 🥚
              </Button>
              <Button variant="ghost" onClick={handleSkip}>
                跳过
              </Button>
            </motion.div>
          )}

          {step === 'hatching' && (
            <motion.p
              className={styles.hint}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              💡 长按魔法蛋直到孵化完成
            </motion.p>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;
