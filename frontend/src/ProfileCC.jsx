import React from 'react';

function ProfileCC({ handle }) {
    if (!handle) return <div className="link-setup-banner"><h3>No Profile Linked</h3><p>Please provide a valid CodeChef handle in the Combined Overview panel.</p></div>;

    return (
        <div className="dashboard-grid">
            <aside className="sidebar-profile-panel">
                <div style={{width: '90px', height: '90px', borderRadius:'50%', background:'#e0e7ff', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 15px auto', border:'2px dashed #4f46e5'}}>
                    <span style={{fontSize:'28px', color:'#4f46e5'}}>CC</span>
                </div>
                <div className="sidebar-info">
                    <h3>CodeChef Chef</h3>
                    <span className="cf-handle-tag" style={{color: '#4f46e5'}}>@{handle}</span>
                </div>
            </aside>

            <section className="analytics-workspace">
                <h3>CodeChef Platform Deep Dive</h3>
                <p style={{ color: '#64748b', fontSize: '14px' }}>Synchronized pipeline ready for core platform scraping architectures.</p>
                <div className="placeholder-view" style={{borderColor: '#e0e7ff'}}>
                    <span style={{color: '#4338ca'}}>[ Inversion Engine point ready for Global Star Ratings and Contest Rank distributions ]</span>
                </div>
            </section>
        </div>
    );
}

export default ProfileCC;