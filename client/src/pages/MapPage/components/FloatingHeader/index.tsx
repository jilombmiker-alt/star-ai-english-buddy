/**
 * FloatingHeader - 悬浮顶栏组件
 * 半透明毛玻璃效果的顶部状态栏
 */

import { memo, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/stores/useAppStore';
import { db, type User, type UserProgress } from '@/db';
import { getTotalProgress, type UnifiedMapNode } from '@/data/unifiedMap';
import { Home, ScrollText } from 'lucide-react';
import styles from './styles.module.css';

interface FloatingHeaderProps {
  nodes: UnifiedMapNode[];
}

const FloatingHeader: React.FC<FloatingHeaderProps> = memo(({ nodes }) => {
  const navigate = useNavigate();
  const { currentUserId } = useAppStore();
  const [user, setUser] = useState<User | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  
  // 加载用户数据
  useEffect(() => {
    if (currentUserId) {
      db.users.get(currentUserId).then(u => setUser(u ?? null)).catch(() => setUser(null));
      db.userProgress.get(currentUserId).then(value => setProgress(value ?? null)).catch(() => setProgress(null));
    }
  }, [currentUserId]);
  
  const totalProgress = getTotalProgress(nodes);
  
  const streakDays = progress?.streakDays ?? 0;
  const magicPower = progress?.magicPower ?? 0;

  return (
    <motion.header
      className={styles.header}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* 左侧 - 用户信息 */}
      <div className={styles.userSection}>
        <motion.div 
          className={styles.avatar}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {user?.buddyName?.charAt(0) || '🐣'}
        </motion.div>
        <div className={styles.userInfo}>
          <span className={styles.userName}>{user?.name || '小魔法师'}</span>
          <div className={styles.userLevel}>
            <span className={styles.levelBadge}>Lv.{Math.floor(totalProgress.completed / 10) + 1}</span>
          </div>
        </div>
      </div>

      {/* 中间 - 统计数据 */}
      <div className={styles.statsSection}>
        <motion.div 
          className={styles.statItem}
          whileHover={{ scale: 1.05 }}
        >
          <span className={styles.statIcon}>🔥</span>
          <span className={styles.statValue}>{streakDays}</span>
          <span className={styles.statLabel}>连续</span>
        </motion.div>
        
        <motion.div 
          className={styles.statItem}
          whileHover={{ scale: 1.05 }}
        >
          <span className={styles.statIcon}>✨</span>
          <span className={styles.statValue}>{magicPower}</span>
          <span className={styles.statLabel}>魔力</span>
        </motion.div>
        
        <motion.div 
          className={styles.statItem}
          whileHover={{ scale: 1.05 }}
        >
          <span className={styles.statIcon}>📚</span>
          <span className={styles.statValue}>{totalProgress.completed}</span>
          <span className={styles.statLabel}>已读</span>
        </motion.div>
      </div>

      {/* 右侧 - 操作按钮 */}
      <div className={styles.actionsSection}>
        <motion.button
          className={styles.actionBtn}
          onClick={() => navigate('/home')}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title="回到星星身边"
          aria-label="回到星星首页"
        >
          <Home size={20} />
        </motion.button>
        <motion.button
          className={styles.actionBtn}
          onClick={() => navigate('/scroll')}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title="守护者卷轴"
        >
          <ScrollText size={20} />
        </motion.button>
        {/* TODO: 设置页面完善后取消隐藏
        <motion.button
          className={styles.actionBtn}
          onClick={() => navigate('/settings')}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title="设置"
        >
          ⚙️
        </motion.button>
        */}
      </div>
    </motion.header>
  );
});

FloatingHeader.displayName = 'FloatingHeader';

export default FloatingHeader;
