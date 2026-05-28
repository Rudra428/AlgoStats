import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    LineChart, Line, BarChart, Bar, XAxis, YAxis, 
    CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import './style/ProfileCF.css'
APP_URL='https://algostats.onrender.com'
function ProfileCF({ handle }) {
    const [profile, setProfile] = useState(null);
    const [ratingData, setRatingData] = useState([]);
    const [problemData, setProblemData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!handle) {
            setLoading(false);
            return;
        }
        
        const loadCFDetails = async () => {
            try {
                // 1. Fetch Basic Profile Info
                const infoRes = await axios.get(`${APP_URL}/api/user/cf/${handle}`);
                setProfile(infoRes.data);

                // 2. Fetch Rating History for the Line Chart
                try {
                    const ratingRes = await axios.get(`${APP_URL}/api/user/cf-rating/${handle}`);
                    const formattedRatings = ratingRes.data.map(contest => {
                        const date = new Date(contest.ratingUpdateTimeSeconds * 1000);
                        return {
                            contestName: contest.contestName,
                            date: `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`,
                            rating: contest.newRating
                        };
                    });
                    setRatingData(formattedRatings);
                } catch (err) { console.error("Rating history unavailable"); }

                // 3. Fetch Submissions for the Difficulty Bar Chart
                try {
                    const statusRes = await axios.get(`${APP_URL}/api/user/cf-status/${handle}`);
                    
                    // Use a Map to only count unique problems (ignoring multiple attempts)
                    const uniqueProblems = new Map();
                    
                    statusRes.data.forEach(sub => {
                        if (sub.verdict === 'OK' && sub.problem.rating) {
                            const problemId = `${sub.problem.contestId}-${sub.problem.index}`;
                            uniqueProblems.set(problemId, sub.problem.rating);
                        }
                    });

                    // Count how many problems exist at each rating level
                    const ratingCounts = {};
                    uniqueProblems.forEach((rating) => {
                        ratingCounts[rating] = (ratingCounts[rating] || 0) + 1;
                    });

                    // Format and sort for Recharts
                    const formattedProblems = Object.keys(ratingCounts)
                        .map(rating => ({
                            rating: rating,
                            count: ratingCounts[rating]
                        }))
                        .sort((a, b) => parseInt(a.rating) - parseInt(b.rating)); // Sort ascending by difficulty

                    setProblemData(formattedProblems);
                } catch (err) { console.error("Submission history unavailable"); }

            } catch (err) {
                setError('Failed to establish telemetry connection to Codeforces.');
            } finally {
                setLoading(false);
            }
        };
        
        loadCFDetails();
    }, [handle]);

    if (!handle) return <div className="link-setup-banner"><h3>No Profile Linked</h3><p>Please provide a valid Codeforces handle in the Combined Overview panel.</p></div>;
    if (loading) return <div className="loading-indicator">Loading...</div>;
    if (error) return <div className="error-message">{error}</div>;

    // Custom Tooltip for the Problem Rating Bar Chart
    const CustomBarTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            return (
                <div style={{ background: '#fff', padding: '10px', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>Rating: {payload[0].payload.rating}</p>
                    <p style={{ margin: 0, color: '#2563eb' }}>Solved: {payload[0].value}</p>
                </div>
            );
        }
        return null;
    };

    // Codeforces official color tier mapping
    const getRatingColor = (ratingStr) => {
        const r = parseInt(ratingStr);
        if (r < 1200) return '#808080'; // Gray (Newbie)
        if (r < 1400) return '#008000'; // Green (Pupil)
        if (r < 1600) return '#03a89e'; // Cyan (Specialist)
        if (r < 1900) return '#0000ff'; // Blue (Expert)
        if (r < 2100) return '#aa00aa'; // Violet (Candidate Master)
        if (r < 2400) return '#ff8c00'; // Orange (Master/International Master)
        return '#ff0000';               // Red (Grandmaster+)
    };

    return (
        <div className="dashboard-grid">
            <aside className="sidebar-profile-panel">
                {profile && (
                    <>
                        <div className="avatar-wrapper">
                            <img src={profile.titlePhoto} alt="Avatar" className="sidebar-avatar" />
                            <span 
                                className="rank-status-dot" 
                                style={{ backgroundColor: getRatingColor(profile.rating || 0) }}
                            />
                        </div>
                        
                        <div className="sidebar-info">
                            <h3 className="user-fullname">
                                {profile.firstName || profile.lastName 
                                    ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
                                    : 'Anonymous Coder'
                                }
                            </h3>
                            <span 
                                className="cf-handle-tag"
                                style={{ color: getRatingColor(profile.rating || 0) }}
                            >
                                @{profile.handle}
                            </span>
                        </div>
                        
                        <div className="stats-list-group">
                            <div className="stat-item">
                                <span className="stat-label">Current Rank</span>
                                <span 
                                    className="stat-value rank-badge"
                                    style={{ color: getRatingColor(profile.rating || 0), backgroundColor: `${getRatingColor(profile.rating || 0)}12` }}
                                >
                                    {profile.rank ? profile.rank.charAt(0).toUpperCase() + profile.rank.slice(1) : 'Unrated'}
                                </span>
                            </div>
                            
                            <div className="stat-item">
                                <span className="stat-label">Active Rating</span>
                                <span className="stat-value rating-number-focus">{profile.rating || 0}</span>
                            </div>
                            
                            <div className="stat-item">
                                <span className="stat-label">Max Rank</span>
                                <span 
                                    className="stat-value rank-badge"
                                    style={{ color: getRatingColor(profile.maxRating || 0), backgroundColor: `${getRatingColor(profile.maxRating || 0)}12` }}
                                >
                                    {profile.maxRank ? profile.maxRank.charAt(0).toUpperCase() + profile.maxRank.slice(1) : 'Unrated'}
                                </span>
                            </div>
                            
                            <div className="stat-item">
                                <span className="stat-label">Peak Rating</span>
                                <span className="stat-value peak-rating-value">{profile.maxRating || 0}</span>
                            </div>
                        </div>
                        <div className="sidebar-action-links">
                            <a 
                                href={`https://codeforces.com/submissions/${profile.handle}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="sidebar-link-btn"
                            >
                                View Submissions
                                <span className="link-arrow-icon">↗</span>
                            </a>
                            <a 
                                href={`https://codeforces.com/contests/with/${profile.handle}`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="sidebar-link-btn secondary-link-btn"
                            >
                                Past Contests
                                <span className="link-arrow-icon">↗</span>
                            </a>
                        </div>
                    </>
                )}
            </aside>

            <section style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                
                {/* 1. RATING PROGRESSION LINE CHART */}
                <div className="analytics-workspace" style={{ minHeight: 'auto' }}>
                    <h3 style={{ marginTop: 0 }}>Rating Progression</h3>
                    {ratingData.length > 0 ? (
                        <div style={{ height: 300, width: '100%', marginTop: '20px' }}>
                            <ResponsiveContainer>
                                <LineChart data={ratingData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickMargin={10} minTickGap={30} />
                                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                        labelStyle={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}
                                    />
                                    <Line type="monotone" dataKey="rating" stroke="#7092dc" strokeWidth={3} dot={{ r: 4, fill: '#1486f8', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p style={{ color: '#64748b' }}>No contest history available yet.</p>
                    )}
                </div>

                {/* 2. PROBLEMS SOLVED BY DIFFICULTY BAR CHART */}
                <div className="analytics-workspace" style={{ minHeight: 'auto' }}>
                    <h3 style={{ marginTop: 0 }}>Problems Solved by Difficulty</h3>
                    {problemData.length > 0 ? (
                        <div style={{ height: 300, width: '100%', marginTop: '20px' }}>
                            <ResponsiveContainer>
                                <BarChart data={problemData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="rating" tick={{ fontSize: 12, fill: '#64748b' }} tickMargin={10} />
                                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<CustomBarTooltip />} cursor={{ fill: '#f1f5f9' }} />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                        {problemData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={getRatingColor(entry.rating)} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p style={{ color: '#64748b' }}>No rated problem history available yet.</p>
                    )}
                </div>

            </section>
        </div>
    );
}

export default ProfileCF;