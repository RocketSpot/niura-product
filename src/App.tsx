import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSpeechRecognition } from 'react-speech-recognition';
import {
  GitHub,
  Settings,
  Mic,
  Activity,
  Loader,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp,
  Check,
  Headphones,
  FilePlus,
  Info,
} from 'react-feather';
import * as Tooltip from '@radix-ui/react-tooltip';
import * as Dialog from '@radix-ui/react-dialog';
import * as Slider from '@radix-ui/react-slider';
import * as Select from '@radix-ui/react-select';
import { isDesktop, isMobile } from 'react-device-detect';

import Button from './design_system/Button';
import SyntaxHighlighter from './design_system/SyntaxHighlighter';
import Message from './design_system/Message';
import API from './lib/api';
import Config from './lib/config';
import Storage from './lib/storage';
// NOTE: we still keep Voice for listening controls/fallback,
// but we no longer rely on Web Speech voices.
import Voice from './lib/voice';

interface ChatMessage {
  type: 'prompt' | 'response';
  text: string;
}

enum State {
  IDLE,
  LISTENING,
  PROCESSING,
}

// ----- Backend URLs (Vercel) -----
const BACKEND_BASE =
  import.meta?.env?.VITE_BACKEND_URL ||
  'https://niura-backend-adhd.vercel.app';
const TTS_URL = `${BACKEND_BASE}/api/tts`;
const VOICES_URL = `${BACKEND_BASE}/api/voices`;

const savedData = Storage.load();

type ElevenVoice = { voice_id: string; name: string };

function App() {
  const {
    browserSupportsSpeechRecognition,
    isMicrophoneAvailable,
    transcript,
    listening,
    finalTranscript,
  } = useSpeechRecognition();

  const initialMessages: ChatMessage[] = [
    { type: 'response', text: 'Try speaking to the microphone.' },
  ];

  const defaultSettingsRef = useRef({
    voiceSpeed: 1,
    elevenVoiceId: '',
    elevenModelId: 'eleven_turbo_v2', // or 'eleven_multilingual_v2'
  });

  const [state, setState] = useState(State.IDLE);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [settings, setSettings] = useState({
    voiceSpeed:
      (savedData?.voiceSpeed as number) ?? defaultSettingsRef.current.voiceSpeed,
    elevenVoiceId:
      (savedData?.elevenVoiceId as string) ??
      defaultSettingsRef.current.elevenVoiceId,
    elevenModelId:
      (savedData?.elevenModelId as string) ??
      defaultSettingsRef.current.elevenModelId,
  });

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false); // no local setup tooltip needed

  const [elevenVoices, setElevenVoices] = useState<ElevenVoice[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voicesError, setVoicesError] = useState<string | null>(null);

  const bottomDivRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch voices from backend (backend uses env key)
  useEffect(() => {
    const loadVoices = async () => {
      setLoadingVoices(true);
      setVoicesError(null);
      try {
        const res = await fetch(VOICES_URL);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const list: ElevenVoice[] = (data?.voices ?? []).map((v: any) => ({
          voice_id: v.voice_id,
          name: v.name,
        }));
        setElevenVoices(list);

        if (!settings.elevenVoiceId && list[0]) {
          setSettings((s) => ({ ...s, elevenVoiceId: list[0].voice_id }));
        }
      } catch (e: any) {
        setVoicesError(e?.message ?? 'Failed to fetch voices');
      } finally {
        setLoadingVoices(false);
      }
    };
    loadVoices();
  }, []); // once on mount

  const recognizeSpeech = () => {
    if (state === State.IDLE) {
      Voice.enableAutoplay?.();
      Voice.startListening();
    } else if (state === State.LISTENING) {
      Voice.stopListening();
    }
  };

  // ElevenLabs-backed speak via backend proxy
  const speak = useCallback(
    async (text: string) => {
      // call your backend proxy (keeps key secret)
      try {
        const res = await fetch(TTS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voiceId: settings.elevenVoiceId,
            modelId: settings.elevenModelId,
          }),
        });
        if (!res.ok) throw new Error(await res.text());

        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);

        if (audioRef.current) {
          audioRef.current.src = objUrl;
          audioRef.current.playbackRate = Number(settings.voiceSpeed) || 1;
          await audioRef.current.play();
          return;
        }
      } catch (err) {
        console.warn('TTS proxy failed, falling back to Web Speech:', err);
      }

      // Last-resort fallback (browser TTS, if available)
      Voice.speak?.(text, { rate: settings.voiceSpeed });
    },
    [settings.elevenVoiceId, settings.elevenModelId, settings.voiceSpeed],
  );

  const resetConversation = () => {
    setState(State.IDLE);
    setMessages(initialMessages);
    Voice.idle?.();
  };

  const handleModalOpenChange = (isOpen: boolean) => {
    setIsModalVisible(isOpen);
    Storage.save(settings);
  };

  const resetSetting = (setting: keyof typeof settings) => {
    setSettings({
      ...settings,
      [setting]: (defaultSettingsRef.current as any)[setting],
    });
  };

  useEffect(() => {
    setState((oldState) => {
      if (listening) return State.LISTENING;
      if ((oldState === State.LISTENING && transcript) || oldState === State.PROCESSING) {
        return State.PROCESSING;
      }
      return State.IDLE;
    });
  }, [listening, transcript, finalTranscript]);

  useEffect(() => {
    if (state === State.LISTENING) {
      bottomDivRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state]);

  useEffect(() => {
    bottomDivRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (state !== State.PROCESSING || !finalTranscript) return;

    const sendToAssistant = async () => {
      setMessages((old) => [...old, { type: 'prompt', text: finalTranscript }]);

      try {
        const { answer } = await API.sendMessage(Config.API_HOST, {
          text: finalTranscript,
        });

        setMessages((old) => [...old, { type: 'response', text: answer }]);
        await speak(answer);
      } catch (err) {
        console.warn(err);
        const fallback = 'Failed to get a response from the assistant.';
        setMessages((old) => [...old, { type: 'response', text: fallback }]);
        await speak(fallback);
      } finally {
        setState(State.IDLE);
      }
    };

    sendToAssistant();
  }, [state, finalTranscript, settings, speak]);

  if (!browserSupportsSpeechRecognition) {
    return <div>This browser doesn't support speech recognition. Please use Chrome.</div>;
  }

  return (
    <div className="container mx-auto px-8 py-9 flex flex-col h-screen gap-y-4 lg:px-28 lg:py-12 lg:relative">
      {/* Hidden audio element for playback */}
      <audio ref={audioRef} style={{ display: 'none' }} />

      <header className="flex flex-col items-center lg:flex-row lg:justify-between lg:mb-4">
        <h1 className="font-title text-3xl text-center w-64 lg:w-auto">
          Niura Product AI
          <div className="inline-block w-4 h-7 ml-2 align-middle bg-dark/40 animate-blink" />
        </h1>
        <div className="mt-4 flex justify-center lg:px-2">
          <a href="https://github.com/rocketspot/" target="_blank">
            <GitHub strokeWidth={1} />
          </a>
        </div>
      </header>

      <main className="flex-1 flex flex-col gap-y-4 overflow-y-auto lg:mr-80 lg:gap-y-8">
        {messages.map(({ type, text }, index) => {
          const getIsActive = () => {
            switch (state) {
              case State.IDLE: {
                if (type === 'prompt') {
                  return index === messages.length - 2;
                } else if (type === 'response') {
                  return index === messages.length - 1;
                }
                return false;
              }
              case State.LISTENING:
                return false;
              case State.PROCESSING:
                return type === 'prompt' && index === messages.length - 1;
              default:
                return false;
            }
          };
          return (
            <Message
              key={`${type}-${index}-${text.slice(0, 12)}`}
              type={type}
              text={text}
              isActive={getIsActive()}
              onClick={speak}
            />
          );
        })}
        {state === State.LISTENING && <Message type="prompt" text={transcript} isActive />}
        <div ref={bottomDivRef} />
      </main>

      <div>
        <div className="lg:absolute lg:right-28 lg:bottom-12 lg:w-72">
          {!isMicrophoneAvailable && (
            <div className="flex gap-x-3 mb-6 text-danger">
              <div className="shrink-0">
                <AlertTriangle strokeWidth={1} />
              </div>
              <div>Please allow microphone permission for this app to work properly.</div>
            </div>
          )}
        </div>

        <div className="flex justify-center items-center gap-x-8 lg:flex-col lg:gap-y-8 lg:absolute lg:top-1/2 lg:right-28 lg:-translate-y-1/2">
          <div>
            <Tooltip.Provider delayDuration={0}>
              <Tooltip.Root open={isTooltipVisible} onOpenChange={setIsTooltipVisible}>
                <Tooltip.Trigger asChild>
                  <div />
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    className="rounded-md px-4 py-3 max-w-xs bg-light border border-dark shadow-solid select-none animate-fade-in"
                    sideOffset={isMobile ? 15 : 10}
                    align={isMobile ? 'start' : 'end'}
                    alignOffset={isMobile ? -50 : 0}
                  >
                    {/* No local setup required now */}
                    Uses cloud backend for voice.
                    <Tooltip.Arrow className="fill-light relative -top-px" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>

            <Button aria-label="Settings" onClick={() => setIsModalVisible(true)}>
              <Settings strokeWidth={1} />
            </Button>
          </div>

          <button
            type="button"
            className={`w-16 h-16 ${
              state === State.IDLE
                ? 'bg-dark'
                : state === State.LISTENING
                ? 'bg-accent1'
                : state === State.PROCESSING
                ? 'bg-accent2'
                : ''
            } text-light flex justify-center items-center rounded-full transition-all hover:opacity-80 focus:opacity-80`}
            onClick={recognizeSpeech}
            disabled={state === State.PROCESSING}
            aria-label={
              state === State.IDLE
                ? 'Start speaking'
                : state === State.LISTENING
                ? 'Listening'
                : state === State.PROCESSING
                ? 'Processing'
                : ''
            }
          >
            {state === State.IDLE ? (
              <Mic strokeWidth={1} size={32} />
            ) : state === State.LISTENING ? (
              <div className="animate-blink">
                <Activity strokeWidth={1} size={32} />
              </div>
            ) : state === State.PROCESSING ? (
              <div className="animate-spin-2">
                <Loader strokeWidth={1} size={32} />
              </div>
            ) : null}
          </button>

          <Button aria-label="New conversation" onClick={resetConversation}>
            <FilePlus strokeWidth={1} />
          </Button>
        </div>
      </div>

      {/* Settings modal */}
      <Dialog.Root open={isModalVisible} onOpenChange={handleModalOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="bg-dark/75 fixed inset-0 animate-fade-in" />
          <Dialog.Content
            className={`bg-light border border-dark rounded-lg shadow-solid fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5/6 max-w-md max-h-screen p-6 animate-rise-up focus:outline-none overflow-y-auto`}
          >
            <Dialog.Title className="font-medium text-xl mb-4">Settings</Dialog.Title>

            <main className="lg:flex lg:gap-x-12">
              <div className="lg:w-full">
                {/* ElevenLabs Section */}
                <div className="mb-4">
                  <h3 className="text-lg font-medium mt-3">Voice (ElevenLabs)</h3>

                  <fieldset className="flex flex-col mt-2">
                    <label htmlFor="eleven-model">Model</label>
                    <Select.Root
                      value={settings.elevenModelId}
                      onValueChange={(v) => setSettings({ ...settings, elevenModelId: v })}
                    >
                      <Select.Trigger
                        id="eleven-model"
                        className="inline-flex items-center justify-between border border-dark rounded-md p-2 text-sm gap-1 bg-transparent"
                        aria-label="Model"
                      >
                        <Select.Value />
                        <Select.Icon>
                          <ChevronDown strokeWidth={1} />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="overflow-hidden bg-light rounded-md border border-dark">
                          <Select.ScrollUpButton className="flex items-center justify-center h-6 bg-light cursor-default">
                            <ChevronUp strokeWidth={1} />
                          </Select.ScrollUpButton>
                          <Select.Viewport className="p-2">
                            {['eleven_turbo_v2', 'eleven_multilingual_v2'].map((m) => (
                              <Select.Item
                                key={m}
                                value={m}
                                className="text-sm rounded flex items-center h-6 py-0 pl-6 pr-9 relative select-none data-[highlighted]:outline-none data-[highlighted]:bg-dark data-[highlighted]:text-light"
                              >
                                <Select.ItemText>{m}</Select.ItemText>
                                <Select.ItemIndicator className="absolute left-0 w-6 inline-flex items-center justify-center">
                                  <Check strokeWidth={1} />
                                </Select.ItemIndicator>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                          <Select.ScrollDownButton className="flex items-center justify-center h-6 bg-light cursor-default">
                            <ChevronDown strokeWidth={1} />
                          </Select.ScrollDownButton>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                  </fieldset>

                  <fieldset className="flex flex-col mt-2">
                    <label htmlFor="eleven-voice">Voice</label>
                    <Select.Root
                      value={settings.elevenVoiceId}
                      onValueChange={(v) => setSettings({ ...settings, elevenVoiceId: v })}
                      disabled={loadingVoices || !!voicesError}
                    >
                      <Select.Trigger
                        id="eleven-voice"
                        className="inline-flex items-center justify-between border border-dark rounded-md p-2 text-sm gap-1 bg-transparent"
                        aria-label="Voice"
                      >
                        <Select.Value
                          placeholder={
                            loadingVoices
                              ? 'Loading voices…'
                              : voicesError
                              ? 'Error loading voices'
                              : 'Select a voice'
                          }
                        />
                        <Select.Icon>
                          <ChevronDown strokeWidth={1} />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="overflow-hidden bg-light rounded-md border border-dark">
                          <Select.Viewport className="p-2">
                            {elevenVoices.map((v) => (
                              <Select.Item
                                key={v.voice_id}
                                value={v.voice_id}
                                className="text-sm rounded flex items-center h-6 py-0 pl-6 pr-9 relative select-none data-[highlighted]:outline-none data-[highlighted]:bg-dark data-[highlighted]:text-light"
                              >
                                <Select.ItemText>{v.name}</Select.ItemText>
                                <Select.ItemIndicator className="absolute left-0 w-6 inline-flex items-center justify-center">
                                  <Check strokeWidth={1} />
                                </Select.ItemIndicator>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                    {voicesError && <small className="text-danger mt-1">{voicesError}</small>}
                  </fieldset>

                  <fieldset className="flex flex-col mt-4">
                    <label htmlFor="voice-speed">Speed</label>
                    <div className="flex gap-x-4 items-center">
                      <Slider.Root
                        id="voice-speed"
                        className="relative flex items-center select-none touch-none h-5 flex-1"
                        value={[settings.voiceSpeed]}
                        onValueChange={([newSpeed]) => {
                          setSettings({ ...settings, voiceSpeed: newSpeed });
                        }}
                        max={2}
                        min={0.5}
                        step={0.1}
                        aria-label="Voice speed"
                      >
                        <Slider.Track className="bg-dark relative flex-1 rounded-full h-1">
                          <Slider.Range className="absolute bg-dark rounded-full h-full" />
                        </Slider.Track>
                        <Slider.Thumb className="block w-5 h-5 bg-light border border-dark rounded-full" />
                      </Slider.Root>
                      <div className="text-right">{`${settings.voiceSpeed.toFixed(2)}x`}</div>
                      <Button iconOnly={false} onClick={() => resetSetting('voiceSpeed')}>
                        Reset
                      </Button>
                    </div>
                  </fieldset>

                  <Button
                    iconOnly={false}
                    className="mt-2"
                    onClick={() => speak('It was a dark and stormy night')}
                  >
                    <Headphones strokeWidth={1} />
                    <span className="ml-1">Try speaking</span>
                  </Button>
                </div>
              </div>
            </main>

            <Dialog.Close asChild>
              <Button className="absolute top-6 right-6" aria-label="Close" size="small">
                <X strokeWidth={1} size={16} />
              </Button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

export default App;
