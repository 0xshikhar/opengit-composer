import React, { KeyboardEvent, useMemo } from 'react';
import { Check, Sparkles, Wand2 } from 'lucide-react';
import { useCommitStore } from '../store/commitStore';
import { useVSCodeAPI } from '../hooks/useVSCodeAPI';

export default function InlineCommitBox() {
    const {
        stagedFiles,
        unstagedFiles,
        quickCommitMessage,
        setQuickCommitMessage,
        isGeneratingQuickCommit,
        isCommitting,
    } = useCommitStore();
    const { postMessage } = useVSCodeAPI();

    const isMac = useMemo(() => {
        if (typeof navigator !== 'undefined') {
            return /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
        }
        return true;
    }, []);

    const shortcutText = isMac ? '⌘Enter' : 'Ctrl+Enter';
    const totalFiles = stagedFiles.length + unstagedFiles.length;
    const canCommit = totalFiles > 0 && quickCommitMessage.trim().length > 0 && !isCommitting;
    const canGenerate = totalFiles > 0 && !isGeneratingQuickCommit;

    const handleCommit = () => {
        if (!canCommit) return;
        postMessage('commitDirect', { message: quickCommitMessage.trim() });
    };

    const handleGenerate = () => {
        if (!canGenerate) return;
        postMessage('generateQuickCommit');
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleCommit();
        }
    };

    return (
        <div className="gc-inline-commit-box">
            <div className="gc-commit-input-wrapper">
                <textarea
                    className="gc-commit-textarea"
                    placeholder={`Message (${shortcutText} to commit)`}
                    value={quickCommitMessage}
                    onChange={(e) => setQuickCommitMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={3}
                    disabled={isCommitting}
                />
                <button
                    type="button"
                    className={`btn btn-icon gc-generate-inline-btn ${isGeneratingQuickCommit ? 'spinning' : ''}`}
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    title="Generate commit message using AI (🪄)"
                >
                    {isGeneratingQuickCommit ? <Sparkles size={14} className="spin" /> : <Wand2 size={14} />}
                </button>
            </div>

            <div className="gc-commit-actions-row">
                <button
                    type="button"
                    className="btn btn-primary gc-direct-commit-btn"
                    onClick={handleCommit}
                    disabled={!canCommit}
                    title={
                        quickCommitMessage.trim().length === 0
                            ? 'Enter a commit message or click 🪄'
                            : `Commit changes (${shortcutText})`
                    }
                >
                    <Check size={14} />
                    <span>{isCommitting ? 'Committing…' : 'Commit'}</span>
                </button>
            </div>
        </div>
    );
}
