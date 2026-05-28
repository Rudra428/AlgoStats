import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Live from './Live';
import './style/Contest.css';
import './style/Live.css';
APP_URL='https://algostats.onrender.com'
function Contest({ userSession }) {
    // History & Live State
    const [pastContests, setPastContests] = useState([]);
    const [activeContest, setActiveContest] = useState(null);
    const [activeProblems, setActiveProblems] = useState([]);

    // Modal / Setup State (Wizard Step 1)
    const [showModal, setShowModal] = useState(false);
    const [formTitle, setFormTitle] = useState(''); // NEW: Custom Contest Name
    const [formStyle, setFormStyle] = useState('leetcode');
    const [formProblems, setFormProblems] = useState(3);
    const [formDuration, setFormDuration] = useState(2);
    const [isDrafting, setIsDrafting] = useState(false);

    // Draft / Review State (Wizard Step 2)
    const [draftData, setDraftData] = useState(null);
    const [swappingIndex, setSwappingIndex] = useState(null);

    // Past Contest Details State (The Archive Modal)
    const [viewingContest, setViewingContest] = useState(null);
    const [viewingProblems, setViewingProblems] = useState([]);

    const fetchContestHistory = async () => {
        if (!userSession?.email) return;
        try {
            const response = await axios.get(`${APP_URL}/api/contest/history?email=${userSession.email}&t=${Date.now()}`);
            setPastContests(response.data);
        } catch (err) { console.error("Failed to retrieve contest history", err); }
    };

    useEffect(() => { fetchContestHistory(); }, [userSession]);



    // NEW: Ref and listener to close the Rules dropdown when clicking outside
    const rulesRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            // If the dropdown exists, and the click happened outside of it, remove the "open" attribute
            if (rulesRef.current && !rulesRef.current.contains(event.target)) {
                rulesRef.current.removeAttribute('open');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    // ----------------------------------------------------
    // LIVE CONTEST & WIZARD ACTIONS
    // ----------------------------------------------------
    const handleDraftContest = async (e) => {
        e.preventDefault();
        setIsDrafting(true);
        try {
            const response = await axios.post(`${APP_URL}/api/contest/draft`, {
                email: userSession.email,
                style: formStyle,
                num_problems: formProblems,
                duration_hours: formDuration
            });
            if (response.data) {
                setDraftData(response.data); 
            }
        } catch (err) {
            console.error("Draft generation failed", err);
        } finally {
            setIsDrafting(false);
        }
    };

    const handleSwapProblem = async (indexToSwap) => {
        setSwappingIndex(indexToSwap);
        const targetProblem = draftData.problems[indexToSwap];
        const currentIds = draftData.problems.map(p => p.id);

        try {
            const response = await axios.post(`${APP_URL}/api/contest/swap`, {
                email: userSession.email,
                style: draftData.style,
                difficulty: targetProblem.difficulty,
                exclude_ids: currentIds
            });

            if (response.data && response.data.problem) {
                const newProblems = [...draftData.problems];
                newProblems[indexToSwap] = response.data.problem;
                setDraftData({ ...draftData, problems: newProblems });
            }
        } catch (err) {
            alert("Could not find an alternative problem in this difficulty tier.");
        } finally {
            setSwappingIndex(null);
        }
    };

    const handleStartLiveMatch = async () => {
        setIsDrafting(true);
        try {
            // NEW: Send the custom title to the backend!
            const fallbackTitle = `${formStyle === 'leetcode' ? 'LeetCode' : 'Codeforces'} Arena`;
            
            const response = await axios.post(`${APP_URL}/api/contest/confirm`, {
                email: userSession.email,
                title: formTitle.trim() || fallbackTitle, 
                style: draftData.style,
                duration: draftData.duration,
                problems: draftData.problems
            });

            if (response.data) {
                const config = {
                    contestId: response.data.contest_id,
                    style: draftData.style,
                    duration: draftData.duration,
                    start_time: response.data.start_time
                };
                setActiveProblems(draftData.problems);
                setActiveContest(config);
                setDraftData(null);
                setShowModal(false);
            }
        } catch (err) {
            console.error("Failed to commit contest to active state", err);
        } finally {
            setIsDrafting(false);
        }
    };

    const handleTerminateActiveContest = async () => {
        if (!activeContest) return;
        try {
            await axios.post(`${APP_URL}/api/contest/end`, {
                contest_id: activeContest.contestId,
                email: userSession.email
            });
        } catch (err) {} 
        finally {
            setActiveContest(null);
            setActiveProblems([]);
            fetchContestHistory();
        }
    };

    // ----------------------------------------------------
    // PAST CONTEST ACTIONS
    // ----------------------------------------------------
    const handleViewContestDetails = async (contest) => {
        try {
            const response = await axios.get(`${APP_URL}/api/contest/${contest.id}/problems`);
            setViewingProblems(response.data);
            setViewingContest(contest);
        } catch (err) {
            console.error("Failed to fetch past contest problems", err);
        }
    };
    
    const handleResumeContest = async (contest) => {
        try {
            const response = await axios.get(`${APP_URL}/api/contest/${contest.id}/problems`);
            const config = {
                contestId: contest.id,
                style: contest.style,
                duration: contest.duration,
                start_time: contest.start_time
            };
            setActiveProblems(response.data);
            setActiveContest(config); 
        } catch (err) {
            console.error("Failed to resume contest:", err);
        }
    };

    // Styling for our new input fields
    const inputStyle = {
        width: '100%',
        padding: '8px 12px',
        borderRadius: '6px',
        border: '1px solid #cbd5e1',
        fontSize: '0.95rem',
        marginTop: '4px',
        boxSizing: 'border-box'
    };

    // ----------------------------------------------------
    // RENDERERS
    // ----------------------------------------------------
    if (activeContest) {
        return <Live config={activeContest} problems={activeProblems} userSession={userSession} onEndContest={handleTerminateActiveContest} />;
    }

    return (
        <div className="contest-arena-container">
            <div className="contest-header-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 className="arena-title">Custom Contests⚙️🛠️</h2>
                    <p className="arena-subtitle">Contest problems will be automatically selected which suits you.</p>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px', position: 'relative' }}>
                    <details ref={rulesRef} className="rules-dropdown" style={{ textAlign: 'right' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: '#64748b', fontWeight: '500', outline: 'none' }}>
                            📖 Rules & Scoring
                        </summary>
                        <div style={{ 
                            position: 'absolute', 
                            right: '0', 
                            top: '24px', 
                            width: '320px', 
                            background: '#ffffff', 
                            border: '1px solid #e2e8f0', 
                            borderRadius: '8px', 
                            padding: '16px', 
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', 
                            zIndex: 50, 
                            textAlign: 'left', 
                            fontSize: '0.85rem', 
                            color: '#334155' 
                        }}>
                            <h4 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Point System</h4>
                            <ul style={{ paddingLeft: '20px', margin: '0 0 12px 0' }}>
                                <li><strong>Codeforces:</strong> Time degradation applies. -50 pts per Wrong Answer (30% point floor).</li>
                                <li><strong>LeetCode:</strong> There is some confideltial socring system. It will be revealed soon! .</li>
                            </ul>
                            
                            <h4 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Expected Rating Math</h4>
                            <ul style={{ paddingLeft: '20px', margin: '0 0 12px 0' }}>
                                <li>Anchored by your <strong>Highest Solved Rating</strong>.</li>
                                <li>Formula: <code>Rating = Highest + ((Yield% - 0.5) * 400)</code></li>
                                <li>Retain &gt;50% of total points to increase performance rating.</li>
                            </ul>

                            <h4 style={{ margin: '0 0 8px 0', color: '#0f172a' }}>Timers</h4>
                            <ul style={{ paddingLeft: '20px', margin: 0 }}>
                                <li>Timers are strictly absolute. Closing the tab does <strong>not</strong> pause the clock.</li>
                            </ul>
                        </div>
                    </details>
                    
                    <button className="btn-create-contest" onClick={() => { setShowModal(true); setDraftData(null); setFormTitle(''); }}>
                        <span className="plus-icon">+</span> Create Contest
                    </button>
                </div>
            </div>

            <div className="contest-history-section">
                <h3 className="section-heading">Your Past Contests</h3>
                {pastContests.length > 0 ? (
                    <div className="contest-grid">
                        {pastContests.map((contest) => (
                            <div key={contest.id} className="contest-card" style={contest.status === 'active' ? { border: '2px solid #ef4444' } : {}}>
                                <div className="contest-card-header">
                                    <h4>{contest.status === 'active' ? '🔴 LIVE: ' : ''}{contest.title}</h4>
                                    <span className="contest-date">{contest.date}</span>
                                </div>
                                <div className="contest-stats">
                                    <div className="contest-stat-item">
                                        <span className="stat-label">Problems</span>
                                        <span className="stat-value">{contest.solved}</span>
                                    </div>
                                    <div className="contest-stat-item">
                                        <span className="stat-label">Total Points</span>
                                        <span className="stat-value">{contest.score > 0 ? contest.score : 0} pts</span>
                                    </div>
                                    <div className="contest-stat-item rank-highlight">
                                        <span className="stat-label">Performance</span>
                                        <span className="stat-value">
                                            {contest.status === 'active' ? 'Pending' : (contest.expected_rating > 0 ? `~${contest.expected_rating}` : "Unrated")}
                                        </span>
                                    </div>
                                </div>
                                
                                {contest.status === 'active' ? (
                                    <button 
                                        className="btn-start-live" 
                                        style={{ width: '100%', marginTop: '12px' }} 
                                        onClick={() => handleResumeContest(contest)}
                                    >
                                        Resume Match
                                    </button>
                                ) : (
                                    <button className="btn-view-results" onClick={() => handleViewContestDetails(contest)}>
                                        View Problem Set
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="empty-state-banner"><p>You haven't participated in any custom contests yet.</p></div>
                )}
            </div>

            {/* TWO-STEP WIZARD MODAL */}
            {showModal && (
                <div className="modal-overlay">
                    <div className="modal-content review-modal-content">
                        
                        {/* STEP 1: CONFIGURATION */}
                        {!draftData ? (
                            <>
                                <h3>Configure Match</h3>
                                <form onSubmit={handleDraftContest} className="contest-form">
                                    
                                    {/* NEW: Clean text & number inputs instead of sliders! */}
                                    <div className="form-group" style={{ marginBottom: '16px' }}>
                                        <label>Contest Name <span style={{color: '#94a3b8'}}>(Optional)</span></label>
                                        <input 
                                            type="text" 
                                            style={inputStyle}
                                            value={formTitle} 
                                            onChange={(e) => setFormTitle(e.target.value)} 
                                            placeholder={`e.g., Target 1400 Push`} 
                                        />
                                    </div>

                                    <div className="form-group" style={{ marginBottom: '16px' }}>
                                        <label>Platform Style</label>
                                        <select style={inputStyle} value={formStyle} onChange={(e) => setFormStyle(e.target.value)}>
                                            <option value="leetcode">LeetCode (Easy/Med/Hard)</option>
                                            <option value="codeforces">Codeforces (Rating Based)</option>
                                        </select>
                                    </div>

                                    <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label>Total Problems</label>
                                            <input 
                                                type="number" 
                                                min="1" 
                                                max="15" 
                                                style={inputStyle}
                                                value={formProblems} 
                                                onChange={(e) => setFormProblems(e.target.value)} 
                                            />
                                        </div>
                                        <div className="form-group" style={{ flex: 1 }}>
                                            <label>Duration (Hours)</label>
                                            <input 
                                                type="number" 
                                                min="0.5" 
                                                max="6" 
                                                step="0.5" 
                                                style={inputStyle}
                                                value={formDuration} 
                                                onChange={(e) => setFormDuration(e.target.value)} 
                                            />
                                        </div>
                                    </div>

                                    <div className="modal-actions">
                                        <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
                                        <button type="submit" className="btn-start" disabled={isDrafting}>
                                            {isDrafting ? "Compiling..." : "Generate Draft"}
                                        </button>
                                    </div>
                                </form>
                            </>
                        ) : (
                            /* STEP 2: REVIEW & CURATE */
                            <>
                                <h3>Review & Start Match</h3>
                                <p className="details-subtitle">Swap out problems you have seen before locking the arena.</p>
                                
                                <div className="past-problems-list">
                                    {draftData.problems.map((prob, idx) => (
                                        <div key={idx} className="past-problem-card">
                                            <div className="past-prob-main">
                                                <span className="past-prob-name">Q{idx + 1}. {prob.name}</span>
                                                <span className="past-prob-diff">Difficulty: {prob.difficulty}</span>
                                            </div>
                                            
                                            <button 
                                                className="btn-swap-problem" 
                                                onClick={() => handleSwapProblem(idx)}
                                                disabled={swappingIndex === idx}
                                            >
                                                {swappingIndex === idx ? "Rerolling..." : "↻ Swap"}
                                            </button>
                                        </div>
                                    ))}
                                </div>

                                <div className="modal-actions">
                                    <button className="btn-cancel" onClick={() => setDraftData(null)}>Back to Settings</button>
                                    <button className="btn-start-live" onClick={handleStartLiveMatch} disabled={isDrafting}>
                                        {isDrafting ? "Locking Matrix..." : "Start Live Timer!"}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* RESTORED: PAST CONTEST DETAILS MODAL */}
            {viewingContest && (
                <div className="modal-overlay">
                    <div className="modal-content details-modal-content">
                        <h3>{viewingContest.title} Archive</h3>
                        <p className="details-subtitle">Played on {viewingContest.date}</p>
                        
                        <div className="past-problems-list">
                            {viewingProblems.map((prob, idx) => (
                                <div key={idx} className="past-problem-card">
                                    <div className="past-prob-main">
                                        <span className="past-prob-name">Q{idx + 1}. {prob.name}</span>
                                        <span className="past-prob-diff">{prob.difficulty}</span>
                                    </div>
                                    <div className="past-prob-actions">
                                        <span className={prob.is_solved ? "status-solved" : "status-missed"}>
                                            {prob.is_solved ? "✓ Solved" : "✗ Missed"}
                                        </span>
                                        <a href={prob.url} target="_blank" rel="noopener noreferrer" className="btn-solve-link text-sm">
                                            Upsolve ↗
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="modal-actions">
                            <button className="btn-cancel" onClick={() => setViewingContest(null)}>Close Archive</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Contest;