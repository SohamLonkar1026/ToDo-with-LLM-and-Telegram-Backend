import { useState } from 'react';
import { X, Copy, RefreshCw, Send, Lock } from 'lucide-react';
import api from '../../services/api';

interface TelegramLinkModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function TelegramLinkModal({ isOpen, onClose }: TelegramLinkModalProps) {
    const [code, setCode] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<'initial' | 'code'>('initial');

    const generateCode = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.post('/telegram/link/generate');
            if (response.data.success) {
                setCode(response.data.code);
                setStep('code');
            } else {
                setError("Failed to generate code.");
            }
        } catch (err) {
            setError("Failed to generate code. Please try again.");
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        if (code) {
            navigator.clipboard.writeText(`/link ${code}`);
        }
    };



    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md p-6 relative">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-blue-500/10 rounded-lg">
                        <Send className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Connect Telegram</h2>
                        <p className="text-slate-400 text-sm">Get tasks & reminders instantly</p>
                    </div>
                </div>

                {/* Content */}
                {step === 'initial' ? (
                    <div className="space-y-4">
                        <div className="p-4 bg-slate-800 rounded-lg border border-slate-700">
                            <h3 className="font-medium text-white mb-2 flex items-center gap-2">
                                <Lock className="w-4 h-4 text-blue-400" />
                                Secure Linking
                            </h3>
                            <p className="text-slate-400 text-sm">
                                We will generate a temporary 6-digit code valid for 5 minutes.
                                Send this code to our Telegram bot to verify your account.
                            </p>
                        </div>

                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            onClick={generateCode}
                            disabled={loading}
                            className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                "Generate Link Code"
                            )}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="text-center">
                            <p className="text-slate-400 text-sm mb-4">
                                Send this command to the bot within 5 minutes:
                            </p>

                            <div
                                onClick={copyToClipboard}
                                className="bg-slate-950 border-2 border-dashed border-slate-700 rounded-xl p-4 cursor-pointer hover:border-blue-500 transition-colors group relative"
                            >
                                <code className="text-2xl font-mono font-bold text-blue-400 tracking-wider">
                                    /link {code}
                                </code>
                                <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                                    <span className="text-white text-sm font-medium flex items-center gap-2">
                                        <Copy className="w-4 h-4" /> Click to Copy
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 text-center">
                            <p className="text-sm text-gray-500 mb-2">
                                Bot Chat Link:
                            </p>
                            <a
                                href="https://t.me/Aimom1121bot"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:text-blue-600 underline font-medium"
                            >
                                https://t.me/Aimom1121bot
                            </a>
                        </div>

                        <div className="pt-4 border-t border-slate-800">
                            <p className="text-xs text-slate-500 text-center">
                                Code expires in 5 minutes. Need a new one?
                                <button onClick={generateCode} className="text-slate-400 hover:text-white ml-1 underline">Regenerate</button>
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
