import React from 'react';
import { useCommitStore } from '../store/commitStore';
import { useVSCodeAPI } from '../hooks/useVSCodeAPI';

export default function StatusBar() {
    const { isLoading, isCommitting, error, errorAction, commitProgress, drafts, reasoning, summary, composeMeta, diagnostics } = useCommitStore();
    const { postMessage } = useVSCodeAPI();

    if (isCommitting && commitProgress) {
        return (
            <div className="status-bar status-committing">
                <span className="status-icon">⏳</span>
                <span>Committing {commitProgress.current}/{commitProgress.total}…</span>
                <div className="progress-bar">
                    <div
                        className="progress-bar-fill"
                        style={{ width: `${(commitProgress.current / commitProgress.total) * 100}%` }}
                    />
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="status-bar status-loading">
                <span className="status-icon spinning">◌</span>
                <span>Analyzing changes with AI…</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="status-bar status-error">
                <span className="status-icon">⚠️</span>
                <span className="error-text">{error}</span>
                {diagnostics && (
                    <span className="status-privacy" title={diagnostics.details || diagnostics.message}>
                        {diagnostics.provider}:{diagnostics.code}{diagnostics.status ? ` • ${diagnostics.status}` : ''}
                    </span>
                )}
                {errorAction && (
                    <button
                        className="btn btn-sm status-inline-action"
                        onClick={() => postMessage(errorAction.command)}
                    >
                        {errorAction.label}
                    </button>
                )}
            </div>
        );
    }

    if (drafts.length > 0) {
        const total = drafts.length;
        const committed = drafts.filter(d => d.state === 'committed').length;
        const avgConfidence = Math.round(
            drafts.reduce((acc, d) => acc + d.confidence, 0) / total
        );
        const modelFailoverActive = composeMeta?.aiModelFailover;
        const aiRequestFailed = composeMeta?.fallbackReason === 'ai_request_failed' || !!composeMeta?.aiRequestError;

        return (
            <div className="status-bar status-ready">
                <span className="status-icon">✅</span>
                <span>{total} draft{total !== 1 ? 's' : ''}</span>
                {committed > 0 && <span className="status-committed">({committed} committed)</span>}
                <span className="status-confidence">Avg confidence: {avgConfidence}%</span>
                {reasoning && (
                    <span className="status-reasoning" title={reasoning}>💡</span>
                )}
                {summary && (
                    <span className="status-summary" title={summary}>📝</span>
                )}
                {composeMeta?.usedFallback && (
                    <span className="status-fallback-badge" title={composeMeta.fallbackReason || 'Fallback mode'}>
                        fallback
                    </span>
                )}
                {aiRequestFailed && (
                    <span
                        className="status-fallback-badge"
                        title={composeMeta?.aiRequestError || 'AI request failed'}
                    >
                        ai request failed
                    </span>
                )}
                {modelFailoverActive && (
                    <span
                        className="status-fallback-badge"
                        title={`Model failover: ${composeMeta?.aiRequestedModel || 'primary'} → ${composeMeta?.aiUsedModel || 'fallback'}`}
                    >
                        model failover
                    </span>
                )}
                {(composeMeta?.excludedFileCount || composeMeta?.redactedMatchCount) ? (
                    <span className="status-privacy">
                        excl:{composeMeta?.excludedFileCount || 0} red:{composeMeta?.redactedMatchCount || 0}
                    </span>
                ) : null}
                <button
                    className="btn btn-sm status-inline-action"
                    onClick={() => postMessage('copySanitizedLogs')}
                >
                    Copy Logs
                </button>
            </div>
        );
    }

    return null;
}
