import sqlite3
from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
from datetime import datetime,timezone
from zoneinfo import ZoneInfo
app = Flask(__name__)
CORS(app)  # Enables seamless frontend cross-origin requests

DB_FILE = "database.db"

def init_db():
    with sqlite3.connect(DB_FILE) as conn:
        cursor = conn.cursor()
        cursor.execute('''CREATE TABLE IF NOT EXISTS users (email TEXT PRIMARY KEY, cf_handle TEXT, lt_handle TEXT)''')
        cursor.execute('''CREATE TABLE IF NOT EXISTS custom_contests (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, style TEXT, num_problems INTEGER, duration_hours INTEGER, start_time DATETIME DEFAULT CURRENT_TIMESTAMP, status TEXT DEFAULT 'active')''')
        cursor.execute('''CREATE TABLE IF NOT EXISTS contest_problems (id INTEGER PRIMARY KEY AUTOINCREMENT, contest_id INTEGER, problem_id TEXT, name TEXT, platform TEXT, difficulty TEXT, url TEXT, is_solved BOOLEAN DEFAULT 0, FOREIGN KEY(contest_id) REFERENCES custom_contests(id))''')
        
        # SAFELY ADD NEW SCORING COLUMNS (Will ignore if they already exist)
        try:
            cursor.execute("ALTER TABLE custom_contests ADD COLUMN total_score INTEGER DEFAULT 0")
            cursor.execute("ALTER TABLE custom_contests ADD COLUMN expected_rating INTEGER DEFAULT 0")
            cursor.execute("ALTER TABLE contest_problems ADD COLUMN earned_points INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass
        try:
            cursor.execute("ALTER TABLE custom_contests ADD COLUMN title TEXT")
        except sqlite3.OperationalError:
            pass
        conn.commit()
    
    # NEW: Contest Problems Table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contest_problems (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contest_id INTEGER,
            problem_id TEXT,
            name TEXT,
            platform TEXT,
            difficulty TEXT, 
            url TEXT,
            is_solved BOOLEAN DEFAULT 0,
            FOREIGN KEY(contest_id) REFERENCES custom_contests(id)
        )
    ''')
    conn.commit()

# Self-initialize on app spin-up
init_db()

# ==========================================
# DATABASE ROUTE ACTIONS
# ==========================================

@app.route('/api/get-handles', methods=['GET'])
def get_handles():
    email = request.args.get('email')
    if not email:
        return jsonify({"error": "Email context required"}), 400
        
    with sqlite3.connect(DB_FILE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT cf_handle, lt_handle FROM users WHERE email = ?", (email,))
        row = cursor.fetchone()
        
    if row:
        return jsonify({"cf": row[0], "lt": row[1]}), 200
    return jsonify({"cf": None, "lt": None}), 200

@app.route('/api/save-handle', methods=['POST'])
def save_handle():
    data = request.json
    email = data.get('email')
    handle = data.get('handle')  # Can be an empty string '' when disconnecting
    platform = data.get('platform') # 'cf' or 'lt'
    
    if not email or handle is None or platform not in ['cf', 'lt']:
        return jsonify({"error": "Missing email, handle value, or platform type"}), 400
        
    column_target = f"{platform}_handle"
    
    with sqlite3.connect(DB_FILE) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM users WHERE email = ?", (email,))
        user_exists = cursor.fetchone()
        
        if user_exists:
            cursor.execute(f"UPDATE users SET {column_target} = ? WHERE email = ?", (handle, email))
        else:
            cursor.execute(f"INSERT INTO users (email, {column_target}) VALUES (?, ?)", (email, handle))
        conn.commit()
        
    return jsonify({"success": True, "message": f"{platform.upper()} handle updated successfully."}), 200

# ==========================================
# CODEFORCES EXTERNAL API PROXY HANDSHAKES
# ==========================================

@app.route('/api/user/cf/<handle>', methods=['GET'])
def get_cf_info(handle):
    try:
        url = f"https://codeforces.com/api/user.info?handles={handle}"
        response = requests.get(url, timeout=10).json()
        if response.get('status') == 'OK':
            return jsonify(response['result'][0]), 200
        return jsonify({"error": response.get('comment', 'Not Found')}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/user/cf-status/<handle>', methods=['GET'])
def get_cf_status(handle):
    try:
        url = f"https://codeforces.com/api/user.status?handle={handle}"
        response = requests.get(url, timeout=10).json()
        if response.get('status') == 'OK':
            return jsonify(response['result']), 200
        return jsonify({"error": response.get('comment', 'Not Found')}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    

@app.route('/api/user/cf-rating/<handle>', methods=['GET'])
def get_cf_rating(handle):
    try:
        url = f"https://codeforces.com/api/user.rating?handle={handle}"
        response = requests.get(url, timeout=10).json()
        if response.get('status') == 'OK':
            return jsonify(response['result']), 200
        return jsonify({"error": response.get('comment', 'Not Found')}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==========================================
# PLATFORM B: LEETCODE GRAPHQL PROXY
# ==========================================

@app.route('/api/user/lt/<handle>', methods=['GET'])
def get_leetcode_info(handle):
    url = "https://leetcode.com/graphql"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://leetcode.com',
        'Content-Type': 'application/json'
    }
    
    query = """
    query getUserProfile($username: String!) {
        matchedUser(username: $username) {
            username
            profile {
                userAvatar
                ranking
                reputation
            }
            submitStats {
                acSubmissionNum {
                    difficulty
                    count
                }
            }
            userCalendar {
                submissionCalendar
            }
        }
        userContestRanking(username: $username) {
            rating
        }
        userContestRankingHistory(username: $username) {
            attended
            rating
            contest {
                title
                startTime
            }
        }
    }
    """
    
    variables = {"username": handle}
    
    try:
        response = requests.post(url, json={'query': query, 'variables': variables}, headers=headers, timeout=10)
        data = response.json()
        
        if data.get('data') and data['data'].get('matchedUser'):
            user_data = data['data']['matchedUser']
            
            contest_data = data['data'].get('userContestRanking')
            lt_rating = contest_data['rating'] if contest_data else 0
            
            cal_str = user_data.get('userCalendar', {}).get('submissionCalendar', '{}')
            
            # Filter history to only include contests the user actually attended
            raw_history = data['data'].get('userContestRankingHistory') or []
            attended_history = [h for h in raw_history if h.get('attended')]
            
            result = {
                "handle": user_data['username'],
                "avatar": user_data['profile'].get('userAvatar', ''),
                "ranking": user_data['profile']['ranking'],
                "reputation": user_data['profile']['reputation'],
                "submissions": user_data['submitStats']['acSubmissionNum'],
                "submissionCalendar": cal_str,
                "rating": lt_rating,
                "ratingHistory": attended_history
            }
            return jsonify(result), 200
            
        return jsonify({"error": "LeetCode profile not found"}), 404
    except Exception as e:
        return jsonify({"error": f"LeetCode sync failed: {str(e)}"}), 500
    



# ==========================================
# CUSTOM CONTEST
# ==========================================
import random

def generate_difficulty_targets(style, n, user_rating=800):
    targets = []
    if style == 'leetcode':
        targets.append('Easy')
        if n >= 7:
            targets.append('Easy')
            for _ in range(n - 4):
                targets.append('Medium')
            targets.extend(['Hard', 'Hard'])
        else:
            for _ in range(n - 2):
                targets.append('Medium')
            targets.append('Hard')
            
    elif style == 'codeforces':
        user_rating = user_rating if user_rating else 800
        
       
        rounded_rating = ((user_rating + 99) // 100) * 100
        
        targets.append(random.choice([800, 900]))
        
        if rounded_rating > 1299:
            targets.append(random.choice([1100, 1200]))
        else:
            targets.append(1000)
            
        remaining = n - 2
        base_rating = max(rounded_rating, 1300)
        
        if n >= 7:
            mid_target = max(rounded_rating, 1200)
            targets.extend([mid_target, mid_target + 100, mid_target + 200])
            remaining -= 3
            for i in range(remaining):
                targets.append(base_rating + (i * 100))
        else:
            for i in range(remaining - 1):
                targets.append(rounded_rating + (i * 100))
            targets.append(base_rating + 200)
            
    if style == 'codeforces':
        targets.sort()
        
    return targets




@app.route('/api/contest/create', methods=['POST'])
def create_contest():
    data = request.json
    email = data.get('email')
    style = data.get('style')
    n = int(data.get('num_problems', 3))
    duration = int(data.get('duration_hours', 2))

    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute("SELECT cf_handle, lt_handle FROM users WHERE email = ?", (email,))
    user_row = cursor.fetchone()
    
    cf_handle = user_row[0] if user_row else None
    lt_handle = user_row[1] if user_row else None

    user_rating = 800
    if style == 'codeforces' and cf_handle:
        try:
            cf_info = requests.get(f"https://codeforces.com/api/user.info?handles={cf_handle}", timeout=5).json()
            if cf_info.get('status') == 'OK':
                user_rating = cf_info['result'][0].get('rating', 800)
        except Exception:
            pass

    target_difficulties = generate_difficulty_targets(style, n, user_rating)

    # DIRECT THE ENGINE TO THE CORRECT FETCHER
    problems_pool = []
    if style == 'codeforces' and cf_handle:
        problems_pool = fetch_unsolved_cf_problems(cf_handle, target_difficulties)
    elif style == 'leetcode' and lt_handle:
        problems_pool = fetch_unsolved_lt_problems(lt_handle, target_difficulties)
    
    # Fallback if unlinked
    if not problems_pool:
        problems_pool = []
        for idx, diff in enumerate(target_difficulties):
            problems_pool.append({
                "id": f"mock_{style}_{idx+1}",
                "name": f"{style.title()} Problem Assignment {idx+1}",
                "difficulty": str(diff),
                "url": "https://leetcode.com/problemset/" if style == 'leetcode' else "https://codeforces.com/problemset"
            })

    cursor.execute('''
        INSERT INTO custom_contests (email, style, num_problems, duration_hours, status)
        VALUES (?, ?, ?, ?, 'active')
    ''', (email, style, n, duration))
    contest_id = cursor.lastrowid

    for prob in problems_pool:
        cursor.execute('''
            INSERT INTO contest_problems (contest_id, problem_id, name, platform, difficulty, url, is_solved)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        ''', (contest_id, prob['id'], prob['name'], style, prob['difficulty'], prob['url']))

    conn.commit()
    conn.close()

    return jsonify({
        "contest_id": contest_id,
        "style": style,
        "duration": duration,
        "problems": problems_pool
    }), 200


@app.route('/api/contest/verify', methods=['POST'])
def verify_contest_progress():
    data = request.json
    contest_id = data.get('contest_id')
    email = data.get('email')

    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM contest_problems WHERE contest_id = ?", (contest_id,))
    db_problems = cursor.fetchall()

    cursor.execute("SELECT cf_handle, lt_handle FROM users WHERE email = ?", (email,))
    user_row = cursor.fetchone()
    
    if not user_row:
        conn.close()
        return jsonify({"error": "User context unavailable"}), 400

    platform_style = db_problems[0]['platform'] if db_problems else 'codeforces'
    solved_identifiers = set()

    # VERIFY AGAINST CODEFORCES
    if platform_style == 'codeforces' and user_row['cf_handle']:
        try:
            res = requests.get(f"https://codeforces.com/api/user.status?handle={user_row['cf_handle']}", timeout=5).json()
            if res.get('status') == 'OK':
                for sub in res['result']:
                    if sub.get('verdict') == 'OK':
                        p = sub['problem']
                        solved_identifiers.add(f"{p.get('contestId')}-{p.get('index')}")
        except Exception:
            pass
            
    # VERIFY AGAINST LEETCODE (Now has headers so it doesn't fail!)
    elif platform_style == 'leetcode' and user_row['lt_handle']:
        try:
            url = "https://leetcode.com/graphql"
            headers = {'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json'}
            query = """query recentAcSubmissions($username: String!, $limit: Int!) { recentAcSubmissionList(username: $username, limit: $limit) { titleSlug } }"""
            res = requests.post(url, json={'query': query, 'variables': {"username": user_row['lt_handle'], "limit": 20}}, headers=headers, timeout=5).json()
            if res.get('data') and res['data'].get('recentAcSubmissionList'):
                for sub in res['data']['recentAcSubmissionList']:
                    solved_identifiers.add(sub['titleSlug']) 
        except Exception:
            pass

    updated_problems = []
    for row in db_problems:
        p_id = row['problem_id']
        is_now_solved = row['is_solved']

        if p_id in solved_identifiers and not is_now_solved:
            cursor.execute("UPDATE contest_problems SET is_solved = 1 WHERE id = ?", (row['id'],))
            is_now_solved = 1

        updated_problems.append({
            "name": row['name'],
            "difficulty": row['difficulty'],
            "url": row['url'],
            "isSolved": bool(is_now_solved)
        })

    conn.commit()
    conn.close()
    return jsonify({"problems": updated_problems}), 200

# --- 1. UPDATED FETCHERS (Now supports excluding seen problems) ---

def fetch_unsolved_cf_problems(handle, target_ratings, exclude_ids=None):
    exclude_set = set(exclude_ids or [])
    solved_keys = set()
    
    try:
        status_url = f"https://codeforces.com/api/user.status?handle={handle}"
        status_resp = requests.get(status_url, timeout=10).json()
        if status_resp.get('status') == 'OK':
            for sub in status_resp['result']:
                if sub.get('verdict') == 'OK':
                    prob = sub['problem']
                    solved_keys.add(f"{prob.get('contestId')}-{prob.get('index')}")
    except Exception:
        pass

    try:
        all_probs_url = "https://codeforces.com/api/problemset.problems"
        probs_resp = requests.get(all_probs_url, timeout=10).json()
        all_problems = probs_resp['result']['problems']
    except Exception:
        return []

    rating_buckets = {}
    for prob in all_problems:
        rating = prob.get('rating')
        if not rating: continue
        
        p_id = f"{prob.get('contestId')}-{prob.get('index')}"
        # Skip if solved OR if it is currently in our draft screen!
        if p_id in solved_keys or p_id in exclude_set: 
            continue
            
        if rating not in rating_buckets:
            rating_buckets[rating] = []
        rating_buckets[rating].append(prob)

    selected = []
    chosen_ids = set()
    
    for target in target_ratings:
        available = rating_buckets.get(target, [])
        pool = [p for p in available if f"{p.get('contestId')}-{p.get('index')}" not in chosen_ids]
        
        if pool:
            pick = random.choice(pool)
            p_id = f"{pick.get('contestId')}-{pick.get('index')}"
            chosen_ids.add(p_id)
            selected.append({
                "id": p_id,
                "name": pick.get('name'),
                "difficulty": str(target),
                "url": f"https://codeforces.com/problemset/problem/{pick.get('contestId')}/{pick.get('index')}"
            })
    return selected


def fetch_unsolved_lt_problems(handle, target_difficulties, exclude_ids=None):
    exclude_set = set(exclude_ids or [])
    recent_solved_slugs = set()
    
    try:
        url = "https://leetcode.com/graphql"
        query = """
        query recentAcSubmissions($username: String!, $limit: Int!) {
            recentAcSubmissionList(username: $username, limit: $limit) { titleSlug }
        }
        """
        res = requests.post(url, json={'query': query, 'variables': {"username": handle, "limit": 50}}, timeout=5).json()
        if res.get('data') and res['data'].get('recentAcSubmissionList'):
            for sub in res['data']['recentAcSubmissionList']:
                recent_solved_slugs.add(sub['titleSlug'])
    except Exception:
        pass

    try:
        res = requests.get("https://leetcode.com/api/problems/algorithms/", timeout=10).json()
        all_problems = res.get('stat_status_pairs', [])
    except Exception:
        return []

    diff_map = {1: 'Easy', 2: 'Medium', 3: 'Hard'}
    buckets = {'Easy': [], 'Medium': [], 'Hard': []}

    for p in all_problems:
        if p.get('paid_only'): continue
        slug = p['stat']['question__title_slug']
        
        # Skip if solved OR if it is currently in our draft screen!
        if slug in recent_solved_slugs or slug in exclude_set: 
            continue

        level = p['difficulty']['level']
        diff_str = diff_map.get(level)
        if diff_str:
            buckets[diff_str].append({
                'id': slug, 'name': p['stat']['question__title'],
                'slug': slug, 'difficulty': diff_str
            })

    selected = []
    chosen_slugs = set()
    
    for target in target_difficulties:
        available = buckets.get(target, [])
        pool = [p for p in available if p['slug'] not in chosen_slugs]
        if pool:
            pick = random.choice(pool)
            chosen_slugs.add(pick['slug'])
            selected.append({
                "id": pick['id'], "name": pick['name'],
                "difficulty": target, "url": f"https://leetcode.com/problems/{pick['slug']}/"
            })
    return selected


# --- 2. NEW DRAFT ROUTE (Stateless Generation) ---

@app.route('/api/contest/draft', methods=['POST'])
def draft_contest():
    """Generates the problem list but DOES NOT save to database yet."""
    data = request.json
    email = data.get('email')
    style = data.get('style')
    n = int(data.get('num_problems', 3))
    duration = int(data.get('duration_hours', 2))

    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute("SELECT cf_handle, lt_handle FROM users WHERE email = ?", (email,))
    user_row = cursor.fetchone()
    conn.close()
    
    cf_handle = user_row[0] if user_row else None
    lt_handle = user_row[1] if user_row else None

    user_rating = 800
    if style == 'codeforces' and cf_handle:
        try:
            cf_info = requests.get(f"https://codeforces.com/api/user.info?handles={cf_handle}", timeout=5).json()
            if cf_info.get('status') == 'OK':
                user_rating = cf_info['result'][0].get('rating', 800)
        except Exception:
            pass

    target_difficulties = generate_difficulty_targets(style, n, user_rating)

    problems_pool = []
    if style == 'codeforces' and cf_handle:
        problems_pool = fetch_unsolved_cf_problems(cf_handle, target_difficulties)
    elif style == 'leetcode' and lt_handle:
        problems_pool = fetch_unsolved_lt_problems(lt_handle, target_difficulties)

    return jsonify({
        "style": style,
        "duration": duration,
        "problems": problems_pool
    }), 200


# --- 3. NEW SWAP ROUTE (Single Problem Reroll) ---

@app.route('/api/contest/swap', methods=['POST'])
def swap_problem():
    """Finds a replacement problem matching the difficulty of the rejected one."""
    data = request.json
    email = data.get('email')
    style = data.get('style')
    difficulty = data.get('difficulty') 
    exclude_ids = data.get('exclude_ids', []) # Array of IDs currently on the screen

    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute("SELECT cf_handle, lt_handle FROM users WHERE email = ?", (email,))
    user_row = cursor.fetchone()
    conn.close()

    cf_handle = user_row[0] if user_row else None
    lt_handle = user_row[1] if user_row else None

    new_prob = None
    if style == 'codeforces' and cf_handle:
        res = fetch_unsolved_cf_problems(cf_handle, [int(difficulty)], exclude_ids)
        if res: new_prob = res[0]
    elif style == 'leetcode' and lt_handle:
        res = fetch_unsolved_lt_problems(lt_handle, [difficulty], exclude_ids)
        if res: new_prob = res[0]

    if not new_prob:
        return jsonify({"error": "No alternative problems found in this tier."}), 404

    return jsonify({"problem": new_prob}), 200


# --- 4. NEW CONFIRM ROUTE (Saves to DB and starts timer) ---

@app.route('/api/contest/confirm', methods=['POST'])
def confirm_contest():
    """Takes the finalized curated list and commits it to SQLite to start the match."""
    data = request.json
    email = data.get('email')
    title = data.get('title')
    style = data.get('style')
    duration = data.get('duration')
    problems = data.get('problems')
    n = len(problems)

    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()

    # Generate exact IST time
    ist_time = datetime.now(ZoneInfo("Asia/Kolkata")).strftime('%Y-%m-%d %H:%M:%S')

    cursor.execute('''
        INSERT INTO custom_contests (email, title, style, num_problems, duration_hours, status, start_time)
        VALUES (?, ?, ?, ?, ?, 'active', ?)
    ''', (email, title, style, n, duration, ist_time))
    contest_id = cursor.lastrowid

    for prob in problems:
        cursor.execute('''
            INSERT INTO contest_problems (contest_id, problem_id, name, platform, difficulty, url, is_solved)
            VALUES (?, ?, ?, ?, ?, ?, 0)
        ''', (contest_id, prob['id'], prob['name'], style, prob['difficulty'], prob['url']))

    conn.commit()
    conn.close()

    # NEW: Send the start_time back to React!
    return jsonify({"contest_id": contest_id, "start_time": ist_time}), 200


@app.route('/api/contest/history', methods=['GET'])
def get_contest_history():
    email = request.args.get('email')
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # 1. Update SELECT to grab 'title'
    cursor.execute('''SELECT id, title, style, num_problems, start_time, duration_hours, status, total_score, expected_rating 
                      FROM custom_contests WHERE email = ? ORDER BY start_time DESC''', (email,))
    contests = cursor.fetchall()
    history = []

    for c in contests:
        cursor.execute('SELECT COUNT(*) as total, SUM(is_solved) as solved FROM contest_problems WHERE contest_id = ?', (c['id'],))
        stats = cursor.fetchone()
        
        history.append({
            "id": c['id'],
            "title": c['title'] if c['title'] else f"{str(c['style']).title()} Arena",
            "date": str(c['start_time']).split()[0] if c['start_time'] else "Unknown",
            "difficulty": f"{stats['total']} Problems",
            "score": c['total_score'],
            "expected_rating": c['expected_rating'],
            "solved": f"{stats['solved'] if stats['solved'] else 0} / {stats['total']}",
            "status": c['status'],
            "style": c['style'],
            "duration": c['duration_hours'],
            "start_time": c['start_time'] # NEW: Give the absolute time to the history card
        })

    conn.close()
    return jsonify(history), 200

@app.route('/api/contest/<int:contest_id>/problems', methods=['GET'])
def get_contest_problems(contest_id):
    """Fetches the exact problem set for a specific past contest."""
    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    try:
        cursor.execute('SELECT * FROM contest_problems WHERE contest_id = ?', (contest_id,))
        problems = [dict(row) for row in cursor.fetchall()]
        return jsonify(problems), 200
    except Exception as e:
        return jsonify({"error": f"Failed to retrieve problems: {str(e)}"}), 500
    finally:
        conn.close()



@app.route('/api/contest/end', methods=['POST'])
def end_custom_contest():
    data = request.json
    contest_id = data.get('contest_id')
    email = data.get('email')

    conn = sqlite3.connect('database.db')
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM custom_contests WHERE id = ?", (contest_id,))
        contest = cursor.fetchone()
        if not contest:
            return jsonify({"error": "Contest not found"}), 404
        
        try:
            start_ts = datetime.strptime(contest['start_time'], '%Y-%m-%d %H:%M:%S').replace(tzinfo=ZoneInfo("Asia/Kolkata")).timestamp()
        except Exception:
            start_ts = datetime.now().timestamp()

        cursor.execute("SELECT * FROM contest_problems WHERE contest_id = ?", (contest_id,))
        db_problems = cursor.fetchall()
        cursor.execute("SELECT cf_handle, lt_handle FROM users WHERE email = ?", (email,))
        user_row = cursor.fetchone()

        total_max_points = 0
        total_earned_points = 0
        highest_solved_rating = 0
        platform_style = db_problems[0]['platform'] if db_problems else 'codeforces'

        cf_submissions = []
        lt_solved_slugs = []

        if platform_style == 'codeforces' and user_row and user_row['cf_handle']:
            try:
                res = requests.get(f"https://codeforces.com/api/user.status?handle={user_row['cf_handle']}&from=1&count=50", timeout=5).json()
                cf_submissions = res.get('result', []) if res.get('status') == 'OK' else []
            except Exception: pass

        elif platform_style == 'leetcode' and user_row and user_row['lt_handle']:
            try:
                url = "https://leetcode.com/graphql"
                headers = {'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json'}
                query = """query recentAcSubmissions($username: String!, $limit: Int!) { recentAcSubmissionList(username: $username, limit: $limit) { titleSlug } }"""
                res = requests.post(url, json={'query': query, 'variables': {"username": user_row['lt_handle'], "limit": 20}}, headers=headers, timeout=5).json()
                lt_solved_slugs = [s['titleSlug'] for s in res['data']['recentAcSubmissionList']] if res.get('data') else []
            except Exception: pass

        rating_map = {'Easy': 800, 'Medium': 1400, 'Hard': 2000}

        for row in db_problems:
            max_pts = get_max_points(row['difficulty'], platform_style)
            total_max_points += max_pts
            
            is_solved = row['is_solved']
            earned = row['earned_points']
            rating_val = int(row['difficulty']) if platform_style == 'codeforces' else rating_map.get(row['difficulty'], 800)

            if platform_style == 'codeforces':
                c_id, p_idx = row['problem_id'].split('-')
                prob_subs = [s for s in cf_submissions if str(s['problem'].get('contestId')) == c_id and s['problem'].get('index') == p_idx and s['creationTimeSeconds'] >= start_ts]
                prob_subs.sort(key=lambda x: x['creationTimeSeconds'])
                
                wa_count = 0
                for sub in prob_subs:
                    if sub['verdict'] == 'OK':
                        is_solved = 1
                        mins_passed = (sub['creationTimeSeconds'] - start_ts) / 60.0
                        degraded = max_pts * (1 - (mins_passed / 250.0))
                        earned = max(degraded - (wa_count * 50), max_pts * 0.3)
                        break
                    elif sub['verdict'] != 'COMPILATION_ERROR':
                        wa_count += 1
            
            elif platform_style == 'leetcode':
                if row['problem_id'] in lt_solved_slugs:
                    is_solved = 1
            
            # THE FIX: Guarantee points are assigned if solved!
            if is_solved and earned == 0:
                earned = max_pts * 0.8
            
            if is_solved:
                highest_solved_rating = max(highest_solved_rating, rating_val)

            total_earned_points += earned
            cursor.execute("UPDATE contest_problems SET is_solved = ?, earned_points = ? WHERE id = ?", (is_solved, int(earned), row['id']))

        expected_rating = 0
        if total_max_points > 0 and highest_solved_rating > 0:
            yield_pct = total_earned_points / total_max_points
            expected_rating = int(highest_solved_rating + ((yield_pct - 0.5) * 400))

        cursor.execute("UPDATE custom_contests SET status = 'completed', total_score = ?, expected_rating = ? WHERE id = ?", (int(total_earned_points), expected_rating, contest_id))
        conn.commit()
        
        return jsonify({"message": "Scored successfully"}), 200

    except Exception as e:
        cursor.execute("UPDATE custom_contests SET status = 'completed' WHERE id = ?", (contest_id,))
        conn.commit()
        return jsonify({"error": f"Failed to score, but contest closed: {str(e)}"}), 500
    finally:
        conn.close()





##rating prediction and points##
def get_max_points(difficulty_str, platform):
    if platform == 'leetcode':
        if difficulty_str == 'Easy': return 500
        if difficulty_str == 'Medium': return 1250
        if difficulty_str == 'Hard': return 2000
        return 500
        
    try:
        r = int(difficulty_str)
        if r <= 800: return 500
        if r <= 1000: return 750
        if r <= 1200: return 1000
        if r <= 1400: return 1250
        if r <= 1600: return 1500
        if r <= 1800: return 1750
        if r <= 2000: return 2000
        if r <= 2500: return 2500
        if r <= 3000: return 3000
        return 5000
    except:
        return 500
if __name__ == '__main__':
    app.run(debug=True, port=5000)