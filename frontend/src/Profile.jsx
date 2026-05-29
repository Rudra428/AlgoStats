import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import CalendarHeatmap from 'react-calendar-heatmap';
import { Tooltip } from 'react-tooltip';

// Import Modular Components
import ProfileCF from './ProfileCF';
import ProfileLT from './ProfileLT';
import Contest from './Contest';
import 'react-calendar-heatmap/dist/styles.css';
import 'react-tooltip/dist/react-tooltip.css';
import './style/Profile.css';
const APP_URL='https://algostats.onrender.com'

// --- THE ALGOSTATS POWER SCORE ENGINE ---
const calculateUnifiedScore = (cfProfile, ltProfile, ltStats, activeDaysCount, cfRatingCounts) => {
    const cfRating = cfProfile?.maxRating || 0;
    const ltRating = ltProfile?.rating || 0; // Defaults to 1500 baseline if no contest data

    let ltVolumeScore = 0;
    if (ltStats && ltStats.length > 0) {
        const easies = ltStats.find(s => s.difficulty === 'Easy')?.count || 0;
        const mediums = ltStats.find(s => s.difficulty === 'Medium')?.count || 0;
        const hards = ltStats.find(s => s.difficulty === 'Hard')?.count || 0;
        ltVolumeScore = (easies * 1) + (mediums * 2.5) + (hards * 5);
    }

    let cfVolumeScore = 0;
    if (cfRatingCounts) {
        Object.keys(cfRatingCounts).forEach(ratingStr => {
            const rating = parseInt(ratingStr);
            const count = cfRatingCounts[ratingStr];
            let weight = 1.0;
            if (rating <= 1000) weight = 1.0;
            else if (rating <= 1300) weight = 2.0;
            else if (rating <= 1700) weight = 4.0;
            else if (rating <= 2200) weight = 4.5;
            else weight = 5.0; // Grandmaster+ territory
            cfVolumeScore += (count * weight);
        });
    }

    const totalVolume = ltVolumeScore + cfVolumeScore;
    const rawScore = (cfRating * 2.0) + (ltRating * 0.9) + (totalVolume * 1.2) + (activeDaysCount * 0.5);

    return Math.min(Math.round(rawScore), 15000);
};

function Profile() {
    const [currentView, setCurrentView] = useState('combined');
    const [heatmapFilter, setHeatmapFilter] = useState('all');

    const [userSession, setUserSession] = useState(() => {
        const saved = localStorage.getItem('algoStatsUser');
        return saved ? JSON.parse(saved) : null;
    });

    const [handles, setHandles] = useState({ cf: '', lt: '' });
    const [cfInput, setCfInput] = useState('');
    const [ltInput, setLtInput] = useState('');

    const [cfTimeline, setCfTimeline] = useState({});
    const [ltTimeline, setLtTimeline] = useState({});

    // New State for the Gamified Score
    const [powerScore, setPowerScore] = useState(0);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (userSession && userSession.email) {
            loadUserHandles(userSession.email);
        }
    }, []);

    const loadUserHandles = async (email) => {
        try {
            const dbResponse = await axios.get(`${APP_URL}/api/get-handles?email=${email}`);
            const data = dbResponse.data;

            setHandles({ cf: data.cf || '', lt: data.lt || '' });
            if (data.cf) setCfInput(data.cf);
            if (data.lt) setLtInput(data.lt);

            await fetchCombinedTimelines(data.cf, data.lt);
        } catch (err) {
            console.error("Error loading handles from DB:", err);
        }
    };

    const handleGoogleSuccess = async (credentialResponse) => {
        try {
            const decoded = jwtDecode(credentialResponse.credential);
            const loggedInUser = { name: decoded.email.split('@')[0], email: decoded.email };

            setUserSession(loggedInUser);
            localStorage.setItem('algoStatsUser', JSON.stringify(loggedInUser));
            setError('');
            await loadUserHandles(loggedInUser.email);
        } catch (err) {
            setError('Secure Authentication Handshake Refused.');
        }
    };

    const fetchCombinedTimelines = async (cfHandle, ltHandle) => {
        setLoading(true);

        const localCfMap = {};
        const localLtMap = {};

        // Variables to hold data for the Power Score
        let cfProfileData = null;
        let cfRatingCounts = {};
        let ltProfileData = null; // <-- NEW: Variable to hold LeetCode profile data
        let ltStatsData = [];

        const formatLocalDate = (unixMs) => {
            const d = new Date(unixMs);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };

        try {
            if (cfHandle) {
                try {
                    // Fetch profile for maxRating
                    const infoRes = await axios.get(`${APP_URL}/api/user/cf/${cfHandle}`);
                    cfProfileData = infoRes.data;

                    // Fetch status for timeline and rating counts
                    const cfResponse = await axios.get(`${APP_URL}/api/user/cf-status/${cfHandle}`);
                    const uniqueProblems = new Map();

                    cfResponse.data.forEach(sub => {
                        if (sub.verdict === 'OK') {
                            const dateStr = formatLocalDate(sub.creationTimeSeconds * 1000);
                            localCfMap[dateStr] = (localCfMap[dateStr] || 0) + 1;

                            if (sub.problem.rating) {
                                const problemId = `${sub.problem.contestId}-${sub.problem.index}`;
                                uniqueProblems.set(problemId, sub.problem.rating);
                            }
                        }
                    });

                    uniqueProblems.forEach((rating) => {
                        cfRatingCounts[rating] = (cfRatingCounts[rating] || 0) + 1;
                    });
                } catch (err) { console.error("CF fetch skipped", err); }
            }

            if (ltHandle) {
                try {
                    const ltResponse = await axios.get(`${APP_URL}/api/user/lt/${ltHandle}`);

                    if (ltResponse.data) {
                        ltProfileData = ltResponse.data; // <-- NEW: Store the entire backend response (including rating)
                        ltStatsData = ltResponse.data.submissions || [];

                        if (ltResponse.data.submissionCalendar) {
                            const ltCal = JSON.parse(ltResponse.data.submissionCalendar);
                            Object.keys(ltCal).forEach(unixTimestamp => {
                                const dateStr = formatLocalDate(parseInt(unixTimestamp) * 1000);
                                localLtMap[dateStr] = (localLtMap[dateStr] || 0) + ltCal[unixTimestamp];
                            });
                        }
                    }
                } catch (err) { console.error("LeetCode fetch skipped", err); }
            }

            setCfTimeline(localCfMap);
            setLtTimeline(localLtMap);

            // Calculate unified active days for the score formula
            const combinedDays = new Set([...Object.keys(localCfMap), ...Object.keys(localLtMap)]).size;

            // Generate Power Score (Notice ltProfileData is no longer null!)
            const finalScore = calculateUnifiedScore(cfProfileData, ltProfileData, ltStatsData, combinedDays, cfRatingCounts);
            setPowerScore(finalScore);

        } catch (err) {
            console.error("Aggregation malfunction:", err);
        } finally {
            setLoading(false);
        }
    };

    const getFilteredSubmissions = () => {
        const masterMap = {};
        if (heatmapFilter === 'all' || heatmapFilter === 'cf') {
            Object.keys(cfTimeline).forEach(date => masterMap[date] = (masterMap[date] || 0) + cfTimeline[date]);
        }
        if (heatmapFilter === 'all' || heatmapFilter === 'lt') {
            Object.keys(ltTimeline).forEach(date => masterMap[date] = (masterMap[date] || 0) + ltTimeline[date]);
        }
        return Object.keys(masterMap).map(date => ({ date, count: masterMap[date] }));
    };

    const handleLinkPlatform = async (e, platform, handleValue) => {
        e.preventDefault();
        if (!handleValue) return;
        setLoading(true);
        try {
            await axios.post(`${APP_URL}/api/save-handle`, { email: userSession.email, handle: handleValue, platform: platform });
            await loadUserHandles(userSession.email);
        } catch (err) { setError('Platform mapping refused.'); }
        finally { setLoading(false); }
    };

    const handleDisconnectPlatform = async (platform) => {
        setLoading(true);
        try {
            await axios.post(`${APP_URL}/api/save-handle`, { email: userSession.email, handle: '', platform: platform });
            if (platform === 'cf') setCfInput('');
            if (platform === 'lt') setLtInput('');
            await loadUserHandles(userSession.email);
        } catch (err) { setError('Failed to clear link.'); }
        finally { setLoading(false); }
    };

    const handleLogout = () => {
        setUserSession(null);
        localStorage.removeItem('algoStatsUser');
        setHandles({ cf: '', lt: '' });
        setCfInput(''); setLtInput('');
        setCfTimeline({}); setLtTimeline({});
        setPowerScore(0);
        setCurrentView('combined');
    };

    const today = new Date();
    const oneYearAgo = new Date(new Date().setFullYear(today.getFullYear() - 1));

    const renderMainWorkspace = () => {
        switch (currentView) {
            case 'cf': return <ProfileCF handle={handles.cf} />;
            case 'lt': return <ProfileLT handle={handles.lt} />;
            case 'contest': return <Contest userSession={userSession} />;
            default:
                return (
                    <div className="main-overview-flow">

                        {/* THE POWER SCORE UI WIDGET */}
                        <div className="power-score-card">
                            <div className="score-header">
                                <h3>AlgoStats Rating</h3>
                                <span className="score-tier-badge">
                                    {powerScore > 10000 ? 'Diamond Tier' : powerScore > 7000 ? 'Platinum Tier' : powerScore > 4000 ? 'Gold Tier' : 'Bronze Tier'}
                                </span>
                            </div>
                            <div className="score-value-container">
                                <span className="score-number">{powerScore.toLocaleString()}</span>
                                <span className="score-max">/ 15,000</span>
                            </div>
                            <div className="score-progress-bar">
                                <div className="score-progress-fill" style={{ width: `${(powerScore / 15000) * 100}%` }}></div>
                            </div>
                        </div>

                        <div className="heatmap-card">
                            <div className="heatmap-header-row">
                                <h3 className="heatmap-title">Aggregated Heatmap</h3>
                                <select className="heatmap-filter-dropdown" value={heatmapFilter} onChange={(e) => setHeatmapFilter(e.target.value)}>
                                    <option value="all">Codeforces + LeetCode</option>
                                    <option value="cf">Codeforces Only</option>
                                    <option value="lt">LeetCode Only</option>
                                </select>
                            </div>

                            <CalendarHeatmap
                                startDate={oneYearAgo}
                                endDate={today}
                                values={getFilteredSubmissions()}
                                classForValue={(val) => {
                                    if (!val || val.count === 0) return 'color-empty';
                                    if (val.count <= 2) return 'color-scale-1';
                                    if (val.count <= 4) return 'color-scale-2';
                                    if (val.count <= 7) return 'color-scale-3';
                                    return 'color-scale-4';
                                }}
                                tooltipDataAttrs={(val) => {
                                    if (!val || !val.date) return { 'data-route-tooltip': 'No solutions submitted' };
                                    return { 'data-route-tooltip': `${val.count} problems resolved on ${val.date}` };
                                }}
                            />
                            <Tooltip anchorSelect="[data-route-tooltip]" data-el-tooltip-content={(el) => el.getAttribute('data-route-tooltip')} />
                        </div>

                        <div className="link-setup-banner">
                            <h3 className="link-setup-title">Connected Accounts</h3>
                            <div className="link-setup-list">
                                <div className="platform-link-block">
                                    <p className="platform-link-title">Codeforces Handle</p>
                                    {handles.cf ? (
                                        <div className="active-linked-badge">
                                            <span>✓ Connected: <strong>@{handles.cf}</strong></span>
                                            <button onClick={() => handleDisconnectPlatform('cf')} className="btn-disconnect">Disconnect</button>
                                        </div>
                                    ) : (
                                        <form onSubmit={(e) => handleLinkPlatform(e, 'cf', cfInput)} className="input-row">
                                            <input type="text" placeholder="CF Username" value={cfInput} onChange={(e) => setCfInput(e.target.value)} className="full-input" />
                                            <button type="submit" className="btn-primary">Link </button>
                                        </form>
                                    )}
                                </div>
                                <div className="platform-link-block">
                                    <p className="platform-link-title">LeetCode Username</p>
                                    {handles.lt ? (
                                        <div className="active-linked-badge badge-lt">
                                            <span>✓ Connected: <strong>@{handles.lt}</strong></span>
                                            <button onClick={() => handleDisconnectPlatform('lt')} className="btn-disconnect">Disconnect</button>
                                        </div>
                                    ) : (
                                        <form onSubmit={(e) => handleLinkPlatform(e, 'lt', ltInput)} className="input-row">
                                            <input type="text" placeholder="LeetCode Username" value={ltInput} onChange={(e) => setLtInput(e.target.value)} className="full-input" />
                                            <button type="submit" className="btn-primary btn-lt">Link </button>
                                        </form>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
        }
    };

    return (
        <div className="full-page-app">
            {!userSession ? (
                <div className="auth-center-screen">
                    <div className="auth-focus-box">

                        <h2 className="auth-title">AlgoStats</h2>
                        <p className="auth-subtitle">Unified Competitive Programming Portal</p>
                        <GoogleLogin onSuccess={handleGoogleSuccess} onError={() => setError('Google Identity Verification Failed.')} />
                        {error && <div className="error-message">{error}</div>}
                    </div>
                </div>
            ) : (
                <>
                    <nav className="navbar">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="40" height="40">
                                <defs>
                                    <linearGradient id="algoGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#3b82f6" />
                                        <stop offset="100%" stopColor="#8b5cf6" />
                                    </linearGradient>
                                </defs>
                                <rect width="100" height="100" rx="22" fill="#0f172a" />

                                {/* The path: Node 1 -> Node 2 -> Node 3, AND Node 4 (Midpoint) -> Node 3 */}
                                <path
                                    d="M 25 70 L 45 35 L 65 70 M 35 52.5 L 65 70"
                                    stroke="url(#algoGrad1)"
                                    strokeWidth="6"
                                    fill="none"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />

                                {/* Node 1: Bottom Left */}
                                <circle cx="25" cy="70" r="7" fill="#3b82f6" />

                                {/* Node 2: Top Peak */}
                                <circle cx="45" cy="35" r="7" fill="#6366f1" />

                                {/* Node 3: Bottom Right */}
                                <circle cx="65" cy="70" r="7" fill="#8b5cf6" />

                                {/* Node 4: Midpoint of 1 & 2 */}
                                <circle cx="35" cy="52.5" r="7" fill="#427bf5" />
                            </svg>
                            <div className="nav-brand" onClick={() => setCurrentView('combined')}>AlgoStats</div></div>
                        <div className="nav-options">
                            <button
                                onClick={() => setCurrentView('combined')}
                                className={currentView === 'combined' ? 'active-nav-tab' : ''}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                                    <polyline points="9 22 9 12 15 12 15 22"></polyline>
                                </svg>
                                Home
                            </button>

                            <button
                                onClick={() => setCurrentView('cf')}
                                className={currentView === 'cf' ? 'active-nav-tab' : ''}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect width="4" height="10" x="3" y="10" rx="1"></rect>
                                    <rect width="4" height="16" x="10" y="4" rx="1"></rect>
                                    <rect width="4" height="6" x="17" y="14" rx="1"></rect>
                                </svg>
                                Codeforces
                            </button>

                            <button
                                onClick={() => setCurrentView('lt')}
                                className={currentView === 'lt' ? 'active-nav-tab' : ''}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="16 18 22 12 16 6"></polyline>
                                    <polyline points="8 6 2 12 8 18"></polyline>
                                </svg>
                                LeetCode
                            </button>

                            <button
                                onClick={() => setCurrentView('contest')}
                                className={currentView === 'contest' ? 'active-nav-tab' : ''}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
                                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
                                    <path d="M4 22h16"></path>
                                    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
                                    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
                                    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
                                </svg>
                                Custom Contests
                            </button>
                        </div>
                        <div className="nav-user-zone">
                            <span className="nav-email">{userSession.email}</span>
                            <button onClick={handleLogout} className="btn-nav-logout">Logout</button>
                        </div>
                    </nav>

                    <main className="dashboard-container">
                        {loading && <div className="loading-indicator">Loading...</div>}
                        {renderMainWorkspace()}
                    </main>
                </>
            )}
        </div>
    );
}

export default Profile;