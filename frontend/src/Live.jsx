import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './style/Live.css';

const APP_URL = 'https://algostats.onrender.com';

function Live({ config, problems: initialProblems, userSession, onEndContest }) {
    const [problems, setProblems] = useState(initialProblems);
    const [verifying, setVerifying] = useState(false);
    const [timeLeft, setTimeLeft] = useState(0);
    const [isTimeUp, setIsTimeUp] = useState(false);

    useEffect(() => {
        if (!config.start_time) {
            setTimeLeft(config.duration * 3600);
            return;
        }

        // 1. BULLETPROOF DATE PARSING (Fixed for +5:30 Shift)
        let startTimeMs;
        
        if (typeof config.start_time === 'string') {
            if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(config.start_time)) {
                // Case A: Freshly created contest ("YYYY-MM-DD HH:MM:SS")
                // Convert space to 'T' and explicitly append IST offset
                startTimeMs = new Date(config.start_time.replace(' ', 'T') + '+05:30').getTime();
            } else {
                // Case B: Resumed contest from History API ("Sat, 30 May 2026 09:33:06 GMT")
                // Flask mistakenly labels the naive DB time as GMT. We correct it to IST (+0530).
                const correctedString = config.start_time.replace('GMT', '+0530');
                startTimeMs = new Date(correctedString).getTime();
            }
        } else {
            startTimeMs = new Date(config.start_time).getTime();
        }

        const durationMs = config.duration * 3600 * 1000;
        const endTimeMs = startTimeMs + durationMs;

        // 2. DYNAMIC CALCULATION
        const updateTimer = () => {
            const nowMs = Date.now();
            const remainingMs = endTimeMs - nowMs;

            if (remainingMs <= 0) {
                setTimeLeft(0);
                if (!isTimeUp) {
                    setIsTimeUp(true);
                    onEndContest(); // AUTO-SUBMIT
                }
                return false; // Tells interval to stop
            }
            
            // Update UI
            setTimeLeft(Math.floor(remainingMs / 1000));
            return true; // Tells interval to keep running
        };

        // Run immediately to prevent 1-second delay
        const keepRunning = updateTimer();

        // 3. START INTERVAL
        if (keepRunning) {
            const timerId = setInterval(() => {
                const shouldContinue = updateTimer();
                if (!shouldContinue) {
                    clearInterval(timerId);
                }
            }, 1000);
            
            // CLEANUP: Wipes the interval if you leave the window!
            return () => clearInterval(timerId);
        }
    }, [config.start_time, config.duration, isTimeUp, onEndContest]);

    const formatTime = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Live tracking integration point
    const handleCheckProgress = async () => {
        setVerifying(true);
        try {
            const response = await axios.post(`${APP_URL}/api/contest/verify`, {
                contest_id: config.contestId,
                email: userSession.email
            });
            if (response.data && response.data.problems) {
                setProblems(response.data.problems);
            }
        } catch (err) {
            console.error("Tracking transaction handshake refused:", err);
        } finally {
            setVerifying(false);
        }
    };

    const getDifficultyColor = (diff, style) => {
        if (style === 'leetcode') {
            if (diff === 'Easy') return '#00b8a3';
            if (diff === 'Medium') return '#ffc01e';
            if (diff === 'Hard') return '#ef4743';
        } else {
            const r = parseInt(diff);
            if (r <= 1100) return '#808080';
            if (r <= 1300) return '#008000';
            if (r <= 1500) return '#03a89e';
            if (r <= 1800) return '#0000ff';
            return '#aa00aa';
        }
        return '#64748b';
    };

    return (
        <div className="live-arena-wrapper">
            <div className="live-header">
                <div className="live-header-info">
                    <span className="live-badge-pulse">🔴 LIVE</span>
                    <h2>{config.style === 'leetcode' ? 'LeetCode Arena Sprint' : 'Codeforces Rated Match'}</h2>
                </div>
                <div className={`live-timer ${timeLeft < 300 ? 'timer-danger' : ''}`}>
                    {formatTime(timeLeft)}
                </div>
                <button className="btn-end-contest" onClick={onEndContest}>
                    Terminate Session
                </button>
            </div>

            <div className="live-problems-container">
                <div className="live-problems-header">
                    <h3>Target Problem Set Matrix</h3>
                    <button 
                        className="btn-refresh-status" 
                        onClick={handleCheckProgress} 
                        disabled={verifying}
                    >
                        {verifying ? "Syncing Grid..." : "↻ Refresh Status"}
                    </button>
                </div>

                <div className="live-problem-list">
                    {problems.map((prob, index) => (
                        <div key={index} className="live-problem-card">
                            <div className="prob-info">
                                <span className="prob-number">Q{index + 1}</span>
                                <div className="prob-details">
                                    <h4>{prob.name}</h4>
                                    <span 
                                        className="prob-difficulty"
                                        style={{ color: getDifficultyColor(prob.difficulty, config.style) }}
                                    >
                                        {config.style === 'codeforces' ? `Rating ${prob.difficulty}` : prob.difficulty}
                                    </span>
                                </div>
                            </div>
                            <div className="prob-actions">
                                <span className={prob.isSolved ? "status-solved" : "status-pending"}>
                                    {prob.isSolved ? "✓ Accepted" : "Unresolved"}
                                </span>
                                <a 
                                    href={prob.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="btn-solve-link"
                                >
                                    Solve Challenge ↗
                                </a>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default Live;