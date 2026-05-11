import React, { useState } from 'react';
import { CheckCircle, Circle, Clock, ChevronDown, ChevronUp, Layers, AlertTriangle } from 'lucide-react';
import Axios from 'axios';
import { API_URL } from '../config';

/**
 * SessionTimeline — Feature B
 *
 * Props:
 *   project        {object}  — The project object from GET /api/projects/:id
 *                              (includes .sessions[], .status, .total_sessions_planned, .total_sessions_actual)
 *   currentSessionId {number} — The appointment id currently open (to highlight the active node)
 *   isAdmin        {boolean} — Show "Mark Complete Early" button when true
 *   onProjectUpdated {fn}    — Callback after a successful complete-early action
 *   loading        {boolean} — Show skeleton while fetching
 */
export default function SessionTimeline({
    project,
    currentSessionId,
    isAdmin = false,
    onProjectUpdated,
    loading = false
}) {
    const [completingEarly, setCompletingEarly] = useState(false);
    const [showConfirmEarly, setShowConfirmEarly] = useState(false);
    const [collapsed, setCollapsed] = useState(false);

    if (loading) {
        return (
            <div style={styles.wrapper}>
                <div style={styles.header}>
                    <Layers size={14} style={{ color: '#be9055' }} />
                    <span style={styles.headerLabel}>Project Timeline</span>
                </div>
                <div style={styles.skeletonRail}>
                    {[1, 2, 3].map(i => (
                        <div key={i} style={styles.skeletonNode} />
                    ))}
                </div>
            </div>
        );
    }

    if (!project) return null;

    const { sessions = [], status, total_sessions_planned, total_sessions_actual, design_title } = project;

    // Build the full node list: real sessions + planned placeholders
    const realMax = sessions.reduce((max, s) => Math.max(max, s.session_number || 0), 0);
    const planned = Math.max(total_sessions_planned || 1, realMax);

    const nodes = Array.from({ length: planned }, (_, i) => {
        const num = i + 1;
        const session = sessions.find(s => (s.session_number || 0) === num);
        return { num, session };
    });

    const isCompleted = status === 'completed' || status === 'completed_early';
    const currentSession = sessions.find(s => s.id === currentSessionId);

    // "Complete Early" eligibility: admin only, project active, at least one session done
    const completedSessions = sessions.filter(s => s.status === 'completed');
    const lastCompletedNum = completedSessions.reduce((max, s) => Math.max(max, s.session_number || 0), 0);
    const canCompleteEarly = isAdmin
        && !isCompleted
        && lastCompletedNum > 0
        && lastCompletedNum < planned;

    const handleCompleteEarly = async () => {
        setCompletingEarly(true);
        try {
            await Axios.put(`${API_URL}/api/projects/${project.id}/complete`, {
                early: true,
                actual_sessions: lastCompletedNum
            });
            setShowConfirmEarly(false);
            if (onProjectUpdated) onProjectUpdated();
        } catch (e) {
            console.error('Failed to complete project early:', e);
        } finally {
            setCompletingEarly(false);
        }
    };

    const getNodeState = (node) => {
        if (!node.session) return 'planned';
        if (node.session.status === 'completed') return 'completed';
        if (node.session.id === currentSessionId) return 'current';
        return 'active'; // confirmed/in_progress/pending but not the current view
    };

    const statusPill = isCompleted
        ? { label: status === 'completed_early' ? 'Completed Early' : 'Completed', bg: '#14532d', color: '#86efac' }
        : { label: 'Active', bg: 'rgba(190,144,85,0.12)', color: '#be9055' };

    return (
        <div style={styles.wrapper}>
            {/* Header row */}
            <div style={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Layers size={14} style={{ color: '#be9055' }} />
                    <span style={styles.headerLabel}>Project Timeline</span>
                    {design_title && <span style={styles.designTitle}>{design_title}</span>}
                    <span style={{ ...styles.statusPill, background: statusPill.bg, color: statusPill.color }}>
                        {statusPill.label}
                    </span>
                    {total_sessions_actual && (
                        <span style={styles.muted}>
                            Completed in {total_sessions_actual} of {planned} sessions
                        </span>
                    )}
                </div>
                <button
                    style={styles.collapseBtn}
                    onClick={() => setCollapsed(c => !c)}
                    title={collapsed ? 'Expand timeline' : 'Collapse timeline'}
                    aria-label={collapsed ? 'Expand timeline' : 'Collapse timeline'}
                >
                    {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
            </div>

            {!collapsed && (
                <>
                    {/* Rail */}
                    <div style={styles.rail}>
                        {nodes.map((node, idx) => {
                            const state = getNodeState(node);
                            const isLast = idx === nodes.length - 1;
                            return (
                                <React.Fragment key={node.num}>
                                    <div style={styles.nodeWrapper} title={node.session
                                        ? `Session ${node.num} — ${node.session.status} — ${node.session.appointment_date || 'TBD'}`
                                        : `Session ${node.num} — Planned`
                                    }>
                                        {/* Connector line (before node, except first) */}
                                        {idx > 0 && (
                                            <div style={{
                                                ...styles.connector,
                                                background: state === 'planned' ? '#334155' : '#be9055'
                                            }} />
                                        )}
                                        {/* Node circle */}
                                        <div style={{
                                            ...styles.nodeCircle,
                                            ...(state === 'completed' ? styles.nodeCompleted : {}),
                                            ...(state === 'current' ? styles.nodeCurrent : {}),
                                            ...(state === 'active' ? styles.nodeActive : {}),
                                            ...(state === 'planned' ? styles.nodePlanned : {}),
                                        }}>
                                            {state === 'completed' && <CheckCircle size={13} style={{ color: '#be9055' }} />}
                                            {(state === 'current' || state === 'active') && (
                                                <span style={styles.nodeNumber}>{node.num}</span>
                                            )}
                                            {state === 'planned' && <Circle size={10} style={{ color: '#475569', strokeWidth: 1.5 }} />}
                                        </div>
                                        {/* Connector after node, except last */}
                                        {!isLast && (
                                            <div style={{
                                                ...styles.connector,
                                                background: getNodeState(nodes[idx + 1]) === 'planned' ? '#334155' : '#be9055'
                                            }} />
                                        )}
                                        {/* Label below */}
                                        <div style={styles.nodeLabel}>
                                            <span style={{
                                                ...styles.nodeLabelNum,
                                                color: state === 'planned' ? '#475569' : state === 'completed' ? '#be9055' : '#f8fafc'
                                            }}>
                                                S{node.num}
                                            </span>
                                            {node.session?.appointment_date && (
                                                <span style={styles.nodeLabelDate}>
                                                    {new Date(node.session.appointment_date + 'T00:00:00').toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>

                    {/* Session summary strip */}
                    {sessions.length > 0 && (
                        <div style={styles.summaryStrip}>
                            <Clock size={11} style={{ color: '#64748b', flexShrink: 0 }} />
                            <span style={styles.muted}>
                                {completedSessions.length} of {planned} sessions completed
                                {currentSession && ` · Session ${currentSession.session_number} currently open`}
                            </span>
                        </div>
                    )}

                    {/* Complete Early */}
                    {canCompleteEarly && !showConfirmEarly && (
                        <button style={styles.completeEarlyBtn} onClick={() => setShowConfirmEarly(true)} title="Mark this project as complete before the planned session count">
                            <AlertTriangle size={13} />
                            Mark Project Complete Early
                        </button>
                    )}

                    {showConfirmEarly && (
                        <div style={styles.earlyConfirmBox}>
                            <p style={styles.earlyConfirmText}>
                                This project was planned for <strong>{planned}</strong> sessions but completed in <strong>{lastCompletedNum}</strong>.
                                Mark as done?
                            </p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <button
                                    style={styles.earlyConfirmYes}
                                    onClick={handleCompleteEarly}
                                    disabled={completingEarly}
                                    title="Confirm: mark this project as completed early"
                                >
                                    {completingEarly ? 'Saving...' : 'Yes, Complete Early'}
                                </button>
                                <button
                                    style={styles.earlyConfirmNo}
                                    onClick={() => setShowConfirmEarly(false)}
                                    title="Cancel — keep project active"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
    wrapper: {
        background: 'rgba(15,23,42,0.6)',
        border: '1px solid rgba(190,144,85,0.18)',
        borderRadius: 14,
        padding: '14px 18px',
        marginBottom: 20
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
        flexWrap: 'wrap',
        gap: 8
    },
    headerLabel: {
        fontSize: 12,
        fontWeight: 700,
        color: '#be9055',
        letterSpacing: '0.5px',
        textTransform: 'uppercase'
    },
    designTitle: {
        fontSize: 12,
        color: '#94a3b8',
        fontStyle: 'italic'
    },
    statusPill: {
        fontSize: 10,
        fontWeight: 700,
        padding: '2px 8px',
        borderRadius: 20,
        letterSpacing: '0.3px'
    },
    muted: {
        fontSize: 11,
        color: '#64748b'
    },
    collapseBtn: {
        background: 'none',
        border: '1px solid rgba(100,116,139,0.25)',
        borderRadius: 6,
        padding: '3px 7px',
        color: '#64748b',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)'
    },
    rail: {
        display: 'flex',
        alignItems: 'center',
        overflowX: 'auto',
        paddingBottom: 8,
        gap: 0
    },
    nodeWrapper: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        position: 'relative',
        flexShrink: 0
    },
    connector: {
        width: 28,
        height: 2,
        borderRadius: 2,
        alignSelf: 'center',
        flexShrink: 0
    },
    nodeCircle: {
        width: 30,
        height: 30,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'all 0.25s ease'
    },
    nodeCompleted: {
        background: 'rgba(190,144,85,0.15)',
        border: '2px solid #be9055'
    },
    nodeCurrent: {
        background: 'rgba(251,191,36,0.2)',
        border: '2.5px solid #f59e0b',
        boxShadow: '0 0 0 4px rgba(245,158,11,0.12)'
    },
    nodeActive: {
        background: 'rgba(99,102,241,0.12)',
        border: '2px solid #6366f1'
    },
    nodePlanned: {
        background: 'rgba(51,65,85,0.5)',
        border: '1.5px solid #334155'
    },
    nodeNumber: {
        fontSize: 11,
        fontWeight: 700,
        color: '#f8fafc'
    },
    nodeLabel: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginTop: 6,
        gap: 1
    },
    nodeLabelNum: {
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.3px'
    },
    nodeLabelDate: {
        fontSize: 9,
        color: '#64748b'
    },
    summaryStrip: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 12,
        paddingTop: 10,
        borderTop: '1px solid rgba(51,65,85,0.4)'
    },
    completeEarlyBtn: {
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        marginTop: 10,
        padding: '6px 14px',
        background: 'rgba(251,191,36,0.08)',
        border: '1px solid rgba(251,191,36,0.3)',
        borderRadius: 8,
        color: '#fbbf24',
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)'
    },
    earlyConfirmBox: {
        marginTop: 12,
        padding: '12px 14px',
        background: 'rgba(251,191,36,0.06)',
        border: '1px solid rgba(251,191,36,0.25)',
        borderRadius: 10
    },
    earlyConfirmText: {
        fontSize: 12,
        color: '#cbd5e1',
        marginBottom: 10,
        lineHeight: 1.6
    },
    earlyConfirmYes: {
        padding: '6px 14px',
        background: '#be9055',
        border: 'none',
        borderRadius: 8,
        color: '#0f172a',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer'
    },
    earlyConfirmNo: {
        padding: '6px 14px',
        background: 'transparent',
        border: '1px solid #475569',
        borderRadius: 8,
        color: '#94a3b8',
        fontSize: 12,
        cursor: 'pointer'
    },
    skeletonRail: {
        display: 'flex',
        gap: 12,
        paddingBottom: 4
    },
    skeletonNode: {
        width: 30,
        height: 30,
        borderRadius: '50%',
        background: 'rgba(51,65,85,0.4)',
        animation: 'pulse 1.5s ease infinite'
    }
};
