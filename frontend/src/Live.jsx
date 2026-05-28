import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './style/Live.css';
const APP_URL='https://algostats.onrender.com'
function Live({ config, problems: initialProblems, userSession, onEndContest }) {
    // const [timeLeft, setTimeLeft] = useState(config.duration * 3600);
    const [problems, setProblems] = useState(initialProblems);
    const [verifying, setVerifying] = useState(false);
    const [timeLeft, setTimeLeft] = useState(() => {
        if (!config.start_time) {
            return config.duration * 3600; // Fallback if no start_time is provided
        }

        // Parse the IST string from DB into a JS Date object
        // The format is "YYYY-MM-DD HH:MM:SS". We assume local browser time aligns closely.
        const startString = config.start_time.replace(' ', 'T'); 
        const startTime = new Date(startString).getTime();
        const now = Date.now();
        
        // Calculate seconds elapsed since the exact start time
        const secondsElapsed = Math.floor((now - startTime) / 1000);
        
        // Total duration allowed in seconds
        const totalDurationSeconds = config.duration * 3600;
        
        // Remaining time is Total - Elapsed. If it's negative, they are out of time!
        const remaining = totalDurationSeconds - secondsElapsed;
        return remaining > 0 ? remaining : 0;
    });

    const [isTimeUp, setIsTimeUp] = useState(timeLeft <= 0);
    useEffect(() => {
        if (timeLeft <= 0) {
            if (!isTimeUp) {
                setIsTimeUp(true);
                // AUTO-SUBMIT: When the clock hits zero, force the contest to end!
                onEndContest(); 
            }
            return;
        }

        const timerId = setInterval(() => {
            setTimeLeft(prev => prev - 1);
        }, 1000);

        return () => clearInterval(timerId);
    }, [timeLeft, isTimeUp, onEndContest]);

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