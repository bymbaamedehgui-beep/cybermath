import { motion } from 'framer-motion';
import { useState } from 'react';
import { CatAvatar, MascotCat } from '../art';
import { sfx } from '../audio/sfx';
import { settingsSummary } from '../components/SettingsForm';
import { ONLINE_ENABLED } from '../net/config';
import { setPrefs, usePrefs } from '../store/prefs';
import { AvatarPicker, Button, Field, inputCls, Modal } from '../ui/ui';

export type MenuTarget = 'continue' | 'new' | 'ai' | 'friends' | 'create' | 'join' | 'teacher' | 'rules';

export function ProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = usePrefs();
  const [name, setName] = useState(prefs.name);
  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="mb-4 text-center text-2xl font-black">Миний муур</h2>
      <div className="grid gap-4">
        <Field label="Хоч нэр">
          <input
            className={inputCls}
            value={name}
            maxLength={16}
            placeholder="Жишээ нь: Тэмүүлэн"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Муураа сонго">
          <AvatarPicker value={prefs.avatar} onChange={(avatar) => setPrefs({ avatar })} />
        </Field>
        <Button
          onClick={() => {
            setPrefs({ name: name.trim().slice(0, 16) });
            onClose();
          }}
        >
          Хадгалах
        </Button>
      </div>
    </Modal>
  );
}

export function MainMenu({ hasSave, onSelect }: { hasSave: boolean; onSelect: (t: MenuTarget) => void }) {
  const prefs = usePrefs();
  const [profile, setProfile] = useState(false);
  const items: { t: MenuTarget; label: string; icon: string; variant: 'primary' | 'neon' | 'ghost' | 'mint' }[] = [
    { t: 'new', label: 'Шинэ тоглоом', icon: '🎮', variant: 'primary' },
    { t: 'ai', label: 'Компьютертэй тоглох', icon: '🤖', variant: 'neon' },
    { t: 'friends', label: 'Найзуудтайгаа тоглох', icon: '👫', variant: 'neon' },
    ...(ONLINE_ENABLED
      ? ([
          { t: 'create', label: 'Өрөө үүсгэх', icon: '🏠', variant: 'ghost' },
          { t: 'join', label: 'Өрөөнд нэгдэх', icon: '🔑', variant: 'ghost' },
        ] as const)
      : []),
    { t: 'teacher', label: 'Багшийн тохиргоо', icon: '👩‍🏫', variant: 'ghost' },
    { t: 'rules', label: 'Дүрэм', icon: '📖', variant: 'ghost' },
  ];
  return (
    <div className="relative z-10 flex h-full flex-col">
      <div className="flex justify-end px-4 pt-[calc(12px+var(--safe-t))] sm:px-6">
        <button
          type="button"
          onClick={() => {
            sfx.click();
            setProfile(true);
          }}
          className="glass flex items-center gap-2 rounded-full py-1 pl-1 pr-4"
        >
          <CatAvatar index={prefs.avatar} mood="happy" className="h-10 w-10" />
          <span className="max-w-[9rem] truncate font-black">{prefs.name || 'Нэрээ оруулах'}</span>
          <span className="text-sm">✏️</span>
        </button>
      </div>
      <div className="thin-scroll flex-1 overflow-y-auto px-4 pb-[calc(20px+var(--safe-b))]">
        <div className="mx-auto flex min-h-full max-w-5xl flex-col items-center justify-center gap-6 lg:flex-row lg:gap-12">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center text-center"
          >
            <MascotCat className="float-y w-[min(78vw,360px)] drop-shadow-[0_20px_40px_rgba(0,0,0,0.45)]" />
            <h1 className="mt-2 text-4xl font-black leading-none tracking-tight sm:text-6xl">
              <span className="neon-text text-cyan-200">Математик</span>
              <br />
              <span className="sun-text text-orange-300">Муурнууд</span>
            </h1>
            <p className="mt-3 max-w-sm font-bold text-violet-100/80">Бодлогоо бод, тэсрэх муурнаас зугт! Сүүлд үлдсэн нь ялна.</p>
          </motion.div>

          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="glass w-full max-w-sm rounded-3xl p-4 sm:p-5"
          >
            <div className="grid gap-2.5">
              {hasSave && (
                <Button variant="mint" size="lg" onClick={() => onSelect('continue')}>
                  ▶ Үргэлжлүүлэх
                </Button>
              )}
              {items.map((it, i) => (
                <motion.div key={it.t} initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.05 }}>
                  <Button variant={it.variant} size={i < 3 ? 'lg' : 'md'} className="w-full !justify-start" onClick={() => onSelect(it.t)}>
                    <span className="w-8 text-center text-xl">{it.icon}</span>
                    {it.label}
                  </Button>
                </motion.div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-black/25 px-3 py-2 text-center text-xs font-bold text-violet-100/75">
              {settingsSummary(prefs.settings)} · {prefs.players} тоглогч
            </div>
          </motion.div>
        </div>
      </div>
      <ProfileModal open={profile} onClose={() => setProfile(false)} />
    </div>
  );
}
