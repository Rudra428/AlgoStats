import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    LineChart, Line, BarChart, Bar, XAxis, YAxis, 
    CartesianGrid, Tooltip, ResponsiveContainer, Cell 
} from 'recharts';
import './style/ProfileLT.css'; // Ensure this matches your CSS filename!
APP_URL='https://algostats.onrender.com'
function ProfileLT({ handle }) {
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
        
        const loadLTDetails = async () => {
            try {
                const response = await axios.get(`${APP_URL}/api/user/lt/${handle}`);
                const data = response.data;
                setProfile(data);

                // 1. Format Rating History for Line Chart
                if (data.ratingHistory && data.ratingHistory.length > 0) {
                    const formattedRatings = data.ratingHistory.map(contest => {
                        const date = new Date(contest.contest.startTime * 1000);
                        return {
                            contestName: contest.contest.title,
                            date: `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`,
                            rating: Math.round(contest.rating)
                        };
                    });
                    setRatingData(formattedRatings);
                }

                // 2. Format Submissions for Difficulty Bar Chart
                if (data.submissions && data.submissions.length > 0) {
                    // Filter out the "All" category, keep only Easy, Medium, Hard
                    const filteredProblems = data.submissions.filter(sub => sub.difficulty !== "All");
                    setProblemData(filteredProblems);
                }

            } catch (err) {
                setError('Failed to establish telemetry connection to LeetCode.');
            } finally {
                setLoading(false);
            }
        };
        
        loadLTDetails();
    }, [handle]);

    if (!handle) return <div className="link-setup-banner"><h3>No Profile Linked</h3><p>Please provide a valid LeetCode handle in the Combined Overview panel.</p></div>;
    if (loading) return <div className="loading-indicator">Querying LeetCode cluster matrices...</div>;
    if (error) return <div className="error-message">{error}</div>;

    // LeetCode Difficulty Color Mapping
    const getDifficultyColor = (difficulty) => {
        if (difficulty === 'Easy') return '#00b8a3';   // LeetCode Teal
        if (difficulty === 'Medium') return '#ffc01e'; // LeetCode Yellow
        if (difficulty === 'Hard') return '#ef4743';   // LeetCode Red
        return '#808080';
    };

    // Custom Tooltip for Bar Chart
    const CustomBarTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const diff = payload[0].payload.difficulty;
            return (
                <div className="custom-chart-tooltip">
                    <p className="tooltip-label" style={{ color: getDifficultyColor(diff) }}>{diff}</p>
                    <p className="tooltip-value" style={{ color: '#0f172a' }}>Solved: {payload[0].value}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="dashboard-grid">
            {/* SIDEBAR PANEL */}
            <aside className="sidebar-profile-panel">
                {profile && (
                    <>
                        <div className="avatar-wrapper">
                            <img 
                                src={profile.avatar || "https://assets.leetcode.com/users/default_avatar.jpg"} 
                                alt="Avatar" 
                                className="sidebar-avatar" 
                            />
                            <span className="rank-status-dot" style={{ backgroundColor: '#ffa116' }} />
                        </div>
                        
                        <div className="sidebar-info">
                            <h3 className="user-fullname">LeetCode Coder</h3>
                            <span className="lt-handle-tag">@{profile.handle}</span>
                        </div>
                        
                        <div className="stats-list-group">
                            <div className="stat-item">
                                <span className="stat-label">Global Rank</span>
                                <span className="stat-value rank-badge lt-badge">
                                    {profile.ranking ? `#${profile.ranking.toLocaleString()}` : 'Unranked'}
                                </span>
                            </div>
                            
                            <div className="stat-item">
                                <span className="stat-label">Contest Rating</span>
                                <span className="stat-value rating-number-focus" style={{ color: '#ffa116' }}>
                                    {Math.round(profile.rating) || 'N/A'}
                                </span>
                            </div>
                            
                            <div className="stat-item">
                                <span className="stat-label">Reputation</span>
                                <span className="stat-value peak-rating-value">{profile.reputation || 0}</span>
                            </div>
                        </div>

                        {/* OFFICIAL PLATFORM SHORTCUTS */}
                        <div className="sidebar-action-links">
                            <a 
                                href={`https://leetcode.com/${profile.handle}/`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="sidebar-link-btn lt-primary-btn"
                            >
                                View Profile & Submissions
                                <span className="link-arrow-icon">↗</span>
                            </a>
                            <a 
                                href={`https://leetcode.com/${profile.handle}/`} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="sidebar-link-btn secondary-link-btn"
                            >
                                Contest History
                                <span className="link-arrow-icon">↗</span>
                            </a>
                        </div>
                    </>
                )}
            </aside>

            {/* MAIN ANALYTICS WORKSPACE */}
            {/* <section className="analytics-layout-stack"> */}
                
                {/* MAIN ANALYTICS WORKSPACE */}
            <section className="analytics-layout-stack">
                
                {/* 1. RATING PROGRESSION LINE CHART */}
                <div className="analytics-workspace chart-auto-height">
                    <h3 className="chart-section-title">Contest Rating Progression</h3>
                    {ratingData.length > 0 ? (
                        <div style={{ height: 300, width: '100%', marginTop: '20px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={ratingData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} tickMargin={10} minTickGap={30} />
                                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <Tooltip 
                                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                        labelStyle={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}
                                    />
                                    {/* LeetCode Orange Line */}
                                    <Line type="monotone" dataKey="rating" stroke="#ffa116" strokeWidth={3} dot={{ r: 4, fill: '#ffa116', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p className="no-data-text">No contest history available yet.</p>
                    )}
                </div>

                {/* 2. PROBLEMS SOLVED BY DIFFICULTY BAR CHART */}
                <div className="analytics-workspace chart-auto-height">
                    <h3 className="chart-section-title">Problems Solved by Difficulty</h3>
                    {problemData.length > 0 ? (
                        <div style={{ height: 300, width: '100%', marginTop: '20px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={problemData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="difficulty" tick={{ fontSize: 12, fill: '#64748b' }} tickMargin={10} />
                                    <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<CustomBarTooltip />} cursor={{ fill: '#f1f5f9' }} />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                                        {problemData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={getDifficultyColor(entry.difficulty)} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <p className="no-data-text">No solved problem history available.</p>
                    )}
                </div>

            </section>

            {/* </section> */}
        </div>
    );
}

export default ProfileLT;