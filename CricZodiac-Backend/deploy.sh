#!/bin/bash
# ============================================================
# CricZodiac — FULL AUTO DEPLOY SCRIPT
# Server:  187.127.99.141
# Domain:  cricket.zodiactech.net
# API:     https://cricket.zodiactech.net/api/v1
#
# Usage:   bash deploy.sh
# Re-run:  bash deploy.sh --update   (code update only)
# ============================================================

set -e

# ── Colors ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; WHITE='\033[1;37m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
info() { echo -e "${CYAN}[→]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

DOMAIN="cricket.zodiactech.net"
SERVER_IP="187.127.99.141"
APP_DIR="/opt/criczodiac"
UPDATE_MODE=false

[[ "$1" == "--update" ]] && UPDATE_MODE=true

echo ""
echo -e "${WHITE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${WHITE}║       CricZodiac — Auto Deploy               ║${NC}"
echo -e "${WHITE}║  Domain: ${CYAN}https://$DOMAIN${WHITE}  ║${NC}"
echo -e "${WHITE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── 1. System Check ───────────────────────────────────────
info "Checking system..."
[[ "$EUID" -ne 0 ]] && err "Run as root: sudo bash deploy.sh"
OS=$(. /etc/os-release && echo "$ID $VERSION_ID")
log "OS: $OS"

# ── 2. Install Dependencies ───────────────────────────────
info "Installing required packages..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq

# Docker
if ! command -v docker &>/dev/null; then
    info "Installing Docker..."
    curl -fsSL https://get.docker.com | bash
    systemctl enable docker
    systemctl start docker
    log "Docker installed"
else
    log "Docker already installed: $(docker --version)"
fi

# Docker Compose plugin
if ! docker compose version &>/dev/null 2>&1; then
    info "Installing Docker Compose..."
    apt-get install -y -qq docker-compose-plugin
fi
log "Docker Compose: $(docker compose version --short 2>/dev/null || echo 'ok')"

# Nginx, Certbot
apt-get install -y -qq nginx certbot python3-certbot-nginx curl wget unzip 2>/dev/null
log "Nginx & Certbot installed"

# ── 3. Create App Directory & Write Files ─────────────────
info "Setting up app directory at $APP_DIR..."
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Write .env if not exists
if [[ ! -f .env ]]; then
    info "Creating .env file..."
    cat > .env << 'ENVEOF'
DB_PASSWORD=CricZ0diac@DB#2024!Secure
MYSQL_ROOT_PASSWORD=CricZ0diacR00t@2024!
JWT_SECRET=criczodiac_jwt_ultra_secret_zodiactech_net_2024_mianrauf_production
ADMIN_EMAIL=admin@zodiactech.net
ADMIN_PASSWORD=Admin@CricZodiac2024!
APP_DOMAIN=cricket.zodiactech.net
ENVEOF
    log ".env created"
fi

source .env

# ── 4. Write All Backend Files ────────────────────────────
info "Writing backend application files..."

# Directory structure
mkdir -p api/v1/{auth,players,teams,matches,sync,upload,users} \
         config includes sql nginx logs uploads/profiles

# ── supervisord.conf ───────────────────────────────────────
cat > supervisord.conf << 'EOF'
[supervisord]
nodaemon=true
logfile=/var/log/supervisord.log
pidfile=/var/run/supervisord.pid
loglevel=warn

[program:nginx]
command=nginx -g 'daemon off;'
autostart=true
autorestart=true
priority=10
stderr_logfile=/var/log/nginx.err.log
stdout_logfile=/var/log/nginx.out.log

[program:php-fpm]
command=php-fpm
autostart=true
autorestart=true
priority=5
stderr_logfile=/var/log/php-fpm.err.log
stdout_logfile=/var/log/php-fpm.out.log
EOF

# ── Dockerfile ────────────────────────────────────────────
cat > Dockerfile << 'EOF'
FROM php:8.2-fpm-alpine
LABEL maintainer="Zodiac Technologies <admin@zodiactech.net>"

RUN apk add --no-cache nginx supervisor libpng-dev libjpeg-turbo-dev libwebp-dev freetype-dev icu-dev oniguruma-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j$(nproc) pdo pdo_mysql gd opcache exif intl mbstring

RUN cp /usr/local/etc/php/php.ini-production /usr/local/etc/php/php.ini \
    && printf "upload_max_filesize=10M\npost_max_size=12M\nmax_execution_time=60\nmemory_limit=256M\nexpose_php=Off\ndisplay_errors=Off\nlog_errors=On\nerror_log=/var/www/html/logs/php_errors.log\n" > /usr/local/etc/php/conf.d/criczodiac.ini \
    && printf "opcache.enable=1\nopcache.memory_consumption=128\nopcache.max_accelerated_files=4000\n" > /usr/local/etc/php/conf.d/opcache.ini

COPY nginx/default.conf /etc/nginx/http.d/default.conf
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

WORKDIR /var/www/html
COPY --chown=www-data:www-data . .

RUN mkdir -p uploads/profiles logs \
    && chown -R www-data:www-data uploads logs \
    && chmod -R 755 uploads logs

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://localhost/health || exit 1

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
EOF

# ── docker-compose.yml ────────────────────────────────────
cat > docker-compose.yml << DCEOF
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: criczodiac_app
    restart: unless-stopped
    ports:
      - "127.0.0.1:8090:80"
    environment:
      DB_HOST: mysql
      DB_PORT: "3306"
      DB_NAME: criczodiac
      DB_USER: criczodiac_user
      DB_PASSWORD: "\${DB_PASSWORD}"
      JWT_SECRET: "\${JWT_SECRET}"
      APP_DOMAIN: "\${APP_DOMAIN:-cricket.zodiactech.net}"
    volumes:
      - uploads_data:/var/www/html/uploads
      - app_logs:/var/www/html/logs
    depends_on:
      mysql:
        condition: service_healthy
    networks:
      - criczodiac_net

  mysql:
    image: mysql:8.0
    container_name: criczodiac_mysql
    restart: unless-stopped
    command: --default-authentication-plugin=mysql_native_password --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci
    environment:
      MYSQL_ROOT_PASSWORD: "\${MYSQL_ROOT_PASSWORD}"
      MYSQL_DATABASE: criczodiac
      MYSQL_USER: criczodiac_user
      MYSQL_PASSWORD: "\${DB_PASSWORD}"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./sql/schema.sql:/docker-entrypoint-initdb.d/01_schema.sql
      - ./sql/seed.sql:/docker-entrypoint-initdb.d/02_seed.sql
    expose:
      - "3306"
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "criczodiac_user", "--password=\${DB_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 15
      start_period: 40s
    networks:
      - criczodiac_net

volumes:
  mysql_data:
  uploads_data:
  app_logs:

networks:
  criczodiac_net:
    driver: bridge
DCEOF

# ── nginx/default.conf ────────────────────────────────────
cat > nginx/default.conf << 'EOF'
server {
    listen 80 default_server;
    server_name _;
    root /var/www/html;
    index index.php index.html;

    location /api/ {
        try_files $uri $uri/ =404;
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type, Accept' always;
        if ($request_method = OPTIONS) {
            add_header 'Access-Control-Allow-Origin' '*';
            add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS';
            add_header 'Access-Control-Allow-Headers' 'Authorization, Content-Type';
            add_header 'Content-Length' 0;
            return 204;
        }
    }

    location ~ \.php$ {
        fastcgi_pass   127.0.0.1:9000;
        fastcgi_index  index.php;
        fastcgi_param  SCRIPT_FILENAME $document_root$fastcgi_script_name;
        fastcgi_param  HTTP_AUTHORIZATION $http_authorization;
        include        fastcgi_params;
        fastcgi_read_timeout 60;
    }

    location /uploads/ {
        alias /var/www/html/uploads/;
        expires 30d;
        add_header 'Access-Control-Allow-Origin' '*';
    }

    location /health {
        return 200 '{"status":"ok","service":"CricZodiac API","version":"1.0"}';
        add_header Content-Type application/json;
    }

    location ~* \.(sql|log|env|sh)$ { deny all; return 404; }
    location ~ /\.git { deny all; return 404; }

    client_max_body_size 10M;
    error_log  /var/log/nginx/error.log warn;
    access_log /var/log/nginx/access.log;
    gzip on;
    gzip_types application/json text/plain;
}
EOF

# ── config/database.php ───────────────────────────────────
cat > config/database.php << 'EOF'
<?php
define('DB_HOST',     getenv('DB_HOST')     ?: 'mysql');
define('DB_PORT',     getenv('DB_PORT')     ?: '3306');
define('DB_NAME',     getenv('DB_NAME')     ?: 'criczodiac');
define('DB_USER',     getenv('DB_USER')     ?: 'criczodiac_user');
define('DB_PASSWORD', getenv('DB_PASSWORD') ?: '');
define('JWT_SECRET',  getenv('JWT_SECRET')  ?: 'change_this_secret');

function getDB(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;
    try {
        $dsn = "mysql:host=".DB_HOST.";port=".DB_PORT.";dbname=".DB_NAME.";charset=utf8mb4";
        $pdo = new PDO($dsn, DB_USER, DB_PASSWORD, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        return $pdo;
    } catch (PDOException $e) {
        http_response_code(503);
        echo json_encode(['success'=>false,'message'=>'Database unavailable']);
        exit;
    }
}
EOF

# ── includes/cors.php ─────────────────────────────────────
cat > includes/cors.php << 'EOF'
<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
header('Content-Type: application/json; charset=UTF-8');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(200); exit; }
EOF

# ── includes/response.php ────────────────────────────────
cat > includes/response.php << 'EOF'
<?php
function sendSuccess(array $data=[], string $message='Success', int $code=200): void {
    http_response_code($code);
    echo json_encode(array_merge(['success'=>true,'message'=>$message], $data));
    exit;
}
function sendError(string $message, int $code=400, array $extra=[]): void {
    http_response_code($code);
    echo json_encode(array_merge(['success'=>false,'message'=>$message], $extra));
    exit;
}
function getInput(): array {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return (json_last_error()===JSON_ERROR_NONE && $data) ? $data : array_merge($_POST, $_GET);
}
function requireFields(array $data, array $fields): void {
    foreach ($fields as $f) { if (empty($data[$f])) sendError("Field '$f' is required.", 422); }
}
EOF

# ── includes/auth.php ────────────────────────────────────
cat > includes/auth.php << 'EOF'
<?php
require_once __DIR__.'/../config/database.php';
require_once __DIR__.'/response.php';
function generateToken(array $payload): string {
    $h = base64_encode(json_encode(['alg'=>'HS256','typ'=>'JWT']));
    $p = base64_encode(json_encode(array_merge($payload,['iat'=>time(),'exp'=>time()+86400*30])));
    $s = hash_hmac('sha256',"$h.$p",JWT_SECRET,true);
    return "$h.$p.".base64_encode($s);
}
function verifyToken(string $token): ?array {
    $parts = explode('.',$token);
    if (count($parts)!==3) return null;
    [$h,$p,$s] = $parts;
    $exp = base64_encode(hash_hmac('sha256',"$h.$p",JWT_SECRET,true));
    if (!hash_equals($exp,$s)) return null;
    $data = json_decode(base64_decode($p),true);
    if (!$data || $data['exp']<time()) return null;
    return $data;
}
function requireAuth(): array {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!$auth || !str_starts_with($auth,'Bearer ')) sendError('Authentication required.',401);
    $user = verifyToken(substr($auth,7));
    if (!$user) sendError('Invalid or expired token.',401);
    return $user;
}
function requireRole(array $roles): array {
    $user = requireAuth();
    if (!in_array($user['role'],$roles)) sendError('Access denied.',403);
    return $user;
}
EOF

# ── api/v1/auth/login.php ────────────────────────────────
cat > api/v1/auth/login.php << 'EOF'
<?php
require_once __DIR__.'/../../../includes/cors.php';
require_once __DIR__.'/../../../includes/response.php';
require_once __DIR__.'/../../../includes/auth.php';
require_once __DIR__.'/../../../config/database.php';
if ($_SERVER['REQUEST_METHOD']!=='POST') sendError('Method not allowed.',405);
$data=getInput(); requireFields($data,['email_or_phone','password']);
$id=trim($data['email_or_phone']); $pw=$data['password'];
$pdo=getDB();
$stmt=$pdo->prepare("SELECT u.*,p.id as player_id,p.player_type,p.profile_pic FROM users u LEFT JOIN players p ON p.user_id=u.id WHERE u.email=? OR u.phone=? LIMIT 1");
$stmt->execute([$id,$id]);
$user=$stmt->fetch();
if (!$user) sendError('No account found.',404);
if (!password_verify($pw,$user['password_hash'])) sendError('Incorrect password.',401);
if ($user['status']==='blocked') sendError('Account blocked. Contact admin.',403);
if ($user['is_approved']==0 && $user['role']!=='admin') sendError('Account pending admin approval.',403);
$token=generateToken(['id'=>$user['id'],'email'=>$user['email'],'role'=>$user['role'],'player_id'=>$user['player_id']]);
$pdo->prepare("UPDATE users SET last_login=NOW() WHERE id=?")->execute([$user['id']]);
sendSuccess(['token'=>$token,'user'=>['id'=>$user['id'],'name'=>$user['name'],'email'=>$user['email'],'phone'=>$user['phone'],'role'=>$user['role'],'player_id'=>$user['player_id'],'player_type'=>$user['player_type'],'profile_pic'=>$user['profile_pic'],'is_approved'=>(bool)$user['is_approved']]],'Login successful.');
EOF

# ── api/v1/auth/register.php ─────────────────────────────
cat > api/v1/auth/register.php << 'EOF'
<?php
require_once __DIR__.'/../../../includes/cors.php';
require_once __DIR__.'/../../../includes/response.php';
require_once __DIR__.'/../../../config/database.php';
if ($_SERVER['REQUEST_METHOD']!=='POST') sendError('Method not allowed.',405);
$data=getInput(); requireFields($data,['name','email','password']);
$name=trim($data['name']); $email=strtolower(trim($data['email']));
$phone=trim($data['phone']??''); $pw=$data['password'];
if (!filter_var($email,FILTER_VALIDATE_EMAIL)) sendError('Invalid email address.');
if (strlen($pw)<8) sendError('Password must be at least 8 characters.');
$pdo=getDB();
$s=$pdo->prepare("SELECT id FROM users WHERE email=?"); $s->execute([$email]);
if ($s->fetch()) sendError('Email already registered.',409);
if ($phone) { $s=$pdo->prepare("SELECT id FROM users WHERE phone=?"); $s->execute([$phone]); if ($s->fetch()) sendError('Phone already registered.',409); }
$hash=password_hash($pw,PASSWORD_BCRYPT,['cost'=>12]);
$pdo->beginTransaction();
try {
    $pdo->prepare("INSERT INTO users (name,email,phone,password_hash,role,status,is_approved,created_at) VALUES (?,?,?,?,'player','pending',0,NOW())")->execute([$name,$email,$phone,$hash]);
    $uid=$pdo->lastInsertId();
    $pdo->prepare("INSERT INTO players (user_id,full_name,email,phone,player_type,created_at) VALUES (?,?,?,?,?,NOW())")->execute([$uid,$name,$email,$phone,$data['player_type']??'allrounder']);
    $pdo->commit();
    sendSuccess(['user_id'=>$uid],'Registration successful. Awaiting admin approval.',201);
} catch(Exception $e) { $pdo->rollBack(); sendError('Registration failed.',500); }
EOF

# ── api/v1/players/create.php ────────────────────────────
cat > api/v1/players/create.php << 'EOF'
<?php
require_once __DIR__.'/../../../includes/cors.php';
require_once __DIR__.'/../../../includes/response.php';
require_once __DIR__.'/../../../includes/auth.php';
require_once __DIR__.'/../../../config/database.php';
requireRole(['admin']);
$data=getInput(); requireFields($data,['full_name']);
$pdo=getDB();
$pdo->prepare("INSERT INTO players (local_id,full_name,email,phone,player_type,is_active,created_at) VALUES (?,?,?,?,?,1,NOW())")->execute([$data['local_id']??null,$data['full_name'],$data['email']??null,$data['phone']??null,$data['player_type']??'allrounder']);
sendSuccess(['player_id'=>$pdo->lastInsertId()],'Player created.',201);
EOF

# ── api/v1/players/list.php ──────────────────────────────
cat > api/v1/players/list.php << 'EOF'
<?php
require_once __DIR__.'/../../../includes/cors.php';
require_once __DIR__.'/../../../includes/response.php';
require_once __DIR__.'/../../../includes/auth.php';
require_once __DIR__.'/../../../config/database.php';
requireAuth();
$pdo=getDB();
$players=$pdo->query("SELECT id,local_id,full_name,email,phone,player_type,profile_pic,is_active,created_at FROM players WHERE is_active=1 ORDER BY full_name")->fetchAll();
sendSuccess(['players'=>$players,'total'=>count($players)]);
EOF

# ── api/v1/players/update.php ────────────────────────────
cat > api/v1/players/update.php << 'EOF'
<?php
require_once __DIR__.'/../../../includes/cors.php';
require_once __DIR__.'/../../../includes/response.php';
require_once __DIR__.'/../../../includes/auth.php';
require_once __DIR__.'/../../../config/database.php';
requireAuth();
$data=getInput(); $id=$data['player_id']??$data['id']??null;
if (!$id) sendError('player_id required.');
$pdo=getDB();
$allowed=['full_name','email','phone','player_type','profile_pic'];
$sets=[]; $params=[];
foreach ($allowed as $f) { if (isset($data[$f])) { $sets[]="$f=?"; $params[]=$data[$f]; } }
if (empty($sets)) sendError('No fields to update.');
$params[]=$id;
$pdo->prepare("UPDATE players SET ".implode(',',$sets).",updated_at=NOW() WHERE id=? OR local_id=?")->execute(array_merge($params,[$id]));
sendSuccess([],'Player updated.');
EOF

# ── api/v1/players/stats.php ─────────────────────────────
cat > api/v1/players/stats.php << 'EOF'
<?php
require_once __DIR__.'/../../../includes/cors.php';
require_once __DIR__.'/../../../includes/response.php';
require_once __DIR__.'/../../../includes/auth.php';
require_once __DIR__.'/../../../config/database.php';
requireAuth();
$pid=$_GET['player_id']??null; if (!$pid) sendError('player_id required.');
$pdo=getDB();
$bat=$pdo->prepare("SELECT COUNT(DISTINCT m.id) as total_matches,COALESCE(SUM(bs.runs_scored),0) as total_runs,COALESCE(MAX(bs.runs_scored),0) as highest_score,COALESCE(SUM(bs.balls_faced),0) as total_balls,COALESCE(SUM(bs.fours),0) as total_fours,COALESCE(SUM(bs.sixes),0) as total_sixes,COALESCE(SUM(CASE WHEN bs.is_out=1 THEN 1 ELSE 0 END),0) as total_outs FROM batting_scorecards bs JOIN innings i ON bs.innings_id=i.id JOIN matches m ON i.match_id=m.id WHERE bs.player_id=(SELECT id FROM players WHERE local_id=? OR id=? LIMIT 1) AND m.status='completed'");
$bat->execute([$pid,$pid]); $b=$bat->fetch();
$b['batting_average']=number_format($b['total_outs']>0?$b['total_runs']/$b['total_outs']:$b['total_runs'],2);
$b['strike_rate']=$b['total_balls']>0?number_format(($b['total_runs']/$b['total_balls'])*100,2):'0.00';
$bowl=$pdo->prepare("SELECT COALESCE(SUM(overs_bowled),0) as total_overs,COALESCE(SUM(wickets),0) as total_wickets,COALESCE(SUM(runs_conceded),0) as runs_conceded,COALESCE(SUM(maidens),0) as maidens FROM bowling_scorecards bwl JOIN innings i ON bwl.innings_id=i.id JOIN matches m ON i.match_id=m.id WHERE bwl.player_id=(SELECT id FROM players WHERE local_id=? OR id=? LIMIT 1) AND m.status='completed'");
$bowl->execute([$pid,$pid]); $bw=$bowl->fetch();
$bw['economy_rate']=$bw['total_overs']>0?number_format($bw['runs_conceded']/$bw['total_overs'],2):'0.00';
sendSuccess(['batting'=>$b,'bowling'=>$bw]);
EOF

# ── api/v1/users/list.php ────────────────────────────────
cat > api/v1/users/list.php << 'EOF'
<?php
require_once __DIR__.'/../../../includes/cors.php';
require_once __DIR__.'/../../../includes/response.php';
require_once __DIR__.'/../../../includes/auth.php';
require_once __DIR__.'/../../../config/database.php';
requireRole(['admin']);
$pdo=getDB();
$users=$pdo->query("SELECT id,name,email,phone,role,status,is_approved,last_login,created_at FROM users ORDER BY created_at DESC")->fetchAll();
sendSuccess(['users'=>$users,'total'=>count($users)]);
EOF

# ── api/v1/users/approve.php ─────────────────────────────
cat > api/v1/users/approve.php << 'EOF'
<?php
require_once __DIR__.'/../../../includes/cors.php';
require_once __DIR__.'/../../../includes/response.php';
require_once __DIR__.'/../../../includes/auth.php';
require_once __DIR__.'/../../../config/database.php';
requireRole(['admin']);
$data=getInput(); requireFields($data,['user_id','action']);
$pdo=getDB(); $uid=(int)$data['user_id'];
switch($data['action']) {
    case 'approve': $pdo->prepare("UPDATE users SET is_approved=1,status='active' WHERE id=?")->execute([$uid]); sendSuccess([],'User approved.');
    case 'block':   $pdo->prepare("UPDATE users SET status='blocked' WHERE id=?")->execute([$uid]);   sendSuccess([],'User blocked.');
    case 'delete':  $pdo->prepare("DELETE FROM users WHERE id=?")->execute([$uid]);                  sendSuccess([],'User deleted.');
    case 'update_role':
        $allowed=['admin','umpire','player'];
        if (!in_array($data['role']??'',$allowed)) sendError('Invalid role.');
        $pdo->prepare("UPDATE users SET role=? WHERE id=?")->execute([$data['role'],$uid]);
        sendSuccess([],'Role updated.');
    default: sendError('Unknown action.');
}
EOF

# ── api/v1/sync/push.php (full) ──────────────────────────
cat > api/v1/sync/push.php << 'SYNCEOF'
<?php
require_once __DIR__.'/../../../includes/cors.php';
require_once __DIR__.'/../../../includes/response.php';
require_once __DIR__.'/../../../includes/auth.php';
require_once __DIR__.'/../../../config/database.php';
if ($_SERVER['REQUEST_METHOD']!=='POST') sendError('Method not allowed.',405);
requireAuth();
$data=getInput(); $items=$data['items']??[];
if (empty($items)) sendError('No sync items provided.');
$pdo=getDB(); $syncedIds=[]; $errors=[];
foreach ($items as $item) {
    $eid=$item['event_id']??null; $tbl=$item['table_name']??null; $act=$item['action']??null; $pay=$item['data']??[];
    if (!$eid||!$tbl||!$act) continue;
    $s=$pdo->prepare("SELECT id FROM sync_logs WHERE event_id=?"); $s->execute([$eid]);
    if ($s->fetch()) { $syncedIds[]=$eid; continue; }
    try {
        $pdo->beginTransaction();
        $ok=false;
        switch($tbl) {
            case 'matches':    $ok=_syncMatch($pdo,$act,$pay); break;
            case 'teams':      $ok=_syncTeam($pdo,$act,$pay); break;
            case 'team_players': $ok=_syncTeamPlayer($pdo,$act,$pay); break;
            case 'toss_results': $ok=_syncToss($pdo,$act,$pay); break;
            case 'innings':    $ok=_syncInnings($pdo,$act,$pay); break;
            case 'overs':      $ok=_syncOver($pdo,$act,$pay); break;
            case 'balls':      $ok=_syncBall($pdo,$act,$pay); break;
            case 'wickets':    $ok=_syncWicket($pdo,$act,$pay); break;
            case 'batting_scorecards': $ok=_syncBatCard($pdo,$act,$pay); break;
            case 'bowling_scorecards': $ok=_syncBowlCard($pdo,$act,$pay); break;
            case 'match_results': $ok=_syncResult($pdo,$act,$pay); break;
            case 'players':    $ok=_syncPlayer($pdo,$act,$pay); break;
            default: $ok=false;
        }
        if ($ok) {
            $pdo->prepare("INSERT INTO sync_logs (event_id,table_name,action,processed_at) VALUES (?,?,?,NOW())")->execute([$eid,$tbl,$act]);
            $syncedIds[]=$eid; $pdo->commit();
        } else { $pdo->rollBack(); $errors[]=['event_id'=>$eid,'error'=>'Handler failed']; }
    } catch(Exception $e) {
        $pdo->rollBack();
        error_log("[Sync] $eid: ".$e->getMessage());
        $errors[]=['event_id'=>$eid,'error'=>$e->getMessage()];
    }
}
sendSuccess(['synced_event_ids'=>$syncedIds,'error_count'=>count($errors),'errors'=>$errors,'all_synced'=>empty($errors)],'Sync processed.');

function _syncMatch($p,$a,$d){ if($a==='create'){$p->prepare("INSERT INTO matches (local_id,title,venue,match_date,overs,players_per_team,status,created_at) VALUES (?,?,?,?,?,?,'setup',NOW()) ON DUPLICATE KEY UPDATE title=VALUES(title),venue=VALUES(venue)")->execute([$d['id'],$d['title'],$d['venue'],$d['match_date'],$d['overs']??6,$d['players_per_team']??6]);}elseif($a==='update'){$cols=['title','venue','match_date','status','toss_winner_id','batting_first','result_text','winner_team_id'];$s=[];$ps=[];foreach($cols as $c){if(isset($d[$c])){$s[]="$c=?";$ps[]=$d[$c];}}if($s){$ps[]=$d['id'];$p->prepare("UPDATE matches SET ".implode(',',$s).",updated_at=NOW() WHERE local_id=?")->execute($ps);}}return true;}
function _syncTeam($p,$a,$d){ $p->prepare("INSERT INTO teams (local_id,match_local_id,team_name,team_label,captain_local_id,created_at) VALUES (?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE team_name=VALUES(team_name)")->execute([$d['id'],$d['match_id'],$d['team_name'],$d['team_label'],$d['captain_id']]); return true; }
function _syncTeamPlayer($p,$a,$d){ $p->prepare("INSERT IGNORE INTO team_players (local_id,team_local_id,player_local_id,batting_order,created_at) VALUES (?,?,?,?,NOW())")->execute([$d['id'],$d['team_id'],$d['player_id'],$d['batting_order']??0]); return true; }
function _syncToss($p,$a,$d){ $p->prepare("INSERT INTO toss_results (local_id,match_local_id,toss_call,toss_outcome,toss_winner_local,elected_to,created_at) VALUES (?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE toss_outcome=VALUES(toss_outcome)")->execute([$d['id'],$d['match_id'],$d['toss_call'],$d['toss_outcome'],$d['toss_winner'],$d['elected_to']]); return true; }
function _syncInnings($p,$a,$d){ if($a==='create'){$p->prepare("INSERT INTO innings (local_id,match_local_id,innings_number,batting_team_local,bowling_team_local,total_runs,total_wickets,created_at) VALUES (?,?,?,?,?,0,0,NOW()) ON DUPLICATE KEY UPDATE total_runs=VALUES(total_runs)")->execute([$d['id'],$d['match_id'],$d['innings_number'],$d['batting_team_id'],$d['bowling_team_id']]);}elseif($a==='update'){$p->prepare("UPDATE innings SET total_runs=?,total_wickets=?,total_overs=?,is_completed=?,updated_at=NOW() WHERE local_id=?")->execute([$d['total_runs']??0,$d['total_wickets']??0,$d['total_overs']??0,$d['is_completed']??0,$d['id']]);}return true;}
function _syncOver($p,$a,$d){ $p->prepare("INSERT INTO overs (local_id,innings_local_id,over_number,bowler_local_id,runs_conceded,wickets,is_maiden,balls_bowled,is_completed,created_at) VALUES (?,?,?,?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE runs_conceded=VALUES(runs_conceded),balls_bowled=VALUES(balls_bowled),is_completed=VALUES(is_completed)")->execute([$d['id'],$d['innings_id'],$d['over_number'],$d['bowler_id'],$d['runs_conceded']??0,$d['wickets']??0,$d['is_maiden']??0,$d['balls_bowled']??0,$d['is_completed']??0]); return true; }
function _syncBall($p,$a,$d){ $p->prepare("INSERT IGNORE INTO balls (local_id,over_local_id,innings_local_id,match_local_id,ball_number,striker_local_id,non_striker_local_id,bowler_local_id,runs_scored,is_wicket,is_extra,extra_type,extra_runs,is_four,is_six,is_valid_ball,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW())")->execute([$d['id'],$d['over_id'],$d['innings_id'],$d['match_id'],$d['ball_number'],$d['striker_id'],$d['non_striker_id'],$d['bowler_id'],$d['runs_scored']??0,$d['is_wicket']??0,$d['is_extra']??0,$d['extra_type']??null,$d['extra_runs']??0,$d['is_four']??0,$d['is_six']??0,$d['is_valid_ball']??1]); return true; }
function _syncWicket($p,$a,$d){ $p->prepare("INSERT IGNORE INTO wickets (local_id,ball_local_id,innings_local_id,batsman_local_id,bowler_local_id,wicket_type,fielder_local_id,runs_at_fall,over_at_fall,created_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())")->execute([$d['id'],$d['ball_id'],$d['innings_id'],$d['batsman_id'],$d['bowler_id'],$d['wicket_type'],$d['fielder_id']??null,$d['runs_at_fall']??0,$d['over_at_fall']??'0.0']); return true; }
function _syncBatCard($p,$a,$d){ $p->prepare("INSERT INTO batting_scorecards (local_id,innings_local_id,player_local_id,runs_scored,balls_faced,fours,sixes,is_out,dismissal_type,batting_order,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE runs_scored=VALUES(runs_scored),balls_faced=VALUES(balls_faced),fours=VALUES(fours),sixes=VALUES(sixes),is_out=VALUES(is_out),dismissal_type=VALUES(dismissal_type)")->execute([$d['id'],$d['innings_id'],$d['player_id'],$d['runs_scored']??0,$d['balls_faced']??0,$d['fours']??0,$d['sixes']??0,$d['is_out']??0,$d['dismissal_type']??null,$d['batting_order']??0]); return true; }
function _syncBowlCard($p,$a,$d){ $p->prepare("INSERT INTO bowling_scorecards (local_id,innings_local_id,player_local_id,overs_bowled,maidens,runs_conceded,wickets,economy_rate,no_balls,wides,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE overs_bowled=VALUES(overs_bowled),wickets=VALUES(wickets),runs_conceded=VALUES(runs_conceded)")->execute([$d['id'],$d['innings_id'],$d['player_id'],$d['overs_bowled']??0,$d['maidens']??0,$d['runs_conceded']??0,$d['wickets']??0,$d['economy_rate']??0,$d['no_balls']??0,$d['wides']??0]); return true; }
function _syncResult($p,$a,$d){ $p->prepare("INSERT INTO match_results (local_id,club_id,series_id,match_local_id,winner_team_local,loser_team_local,result_type,margin,margin_type,team_a_score,team_b_score,player_of_match_local,result_text,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE club_id=COALESCE(VALUES(club_id),club_id),series_id=COALESCE(VALUES(series_id),series_id),result_text=VALUES(result_text)")->execute([$d['id'],$d['club_id']??null,$d['series_id']??null,$d['match_local_id']??($d['match_id']??null),$d['winner_team_local']??($d['winner_team_id']??null),$d['loser_team_local']??($d['loser_team_id']??null),$d['result_type']??'win',$d['margin']??0,$d['margin_type']??'runs',$d['team_a_score']??null,$d['team_b_score']??null,$d['player_of_match_local']??($d['player_of_match']??null),$d['result_text']??null]); return true; }
function _syncPlayer($p,$a,$d){ if($a==='create'){$p->prepare("INSERT INTO players (local_id,full_name,email,phone,player_type,created_at) VALUES (?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE full_name=VALUES(full_name)")->execute([$d['id'],$d['full_name'],$d['email']??null,$d['phone']??null,$d['player_type']??'allrounder']);}elseif($a==='update'){$p->prepare("UPDATE players SET full_name=?,email=?,phone=?,player_type=?,updated_at=NOW() WHERE local_id=? OR id=?")->execute([$d['full_name'],$d['email']??null,$d['phone']??null,$d['player_type']??'allrounder',$d['id'],$d['id']]);}return true;}
SYNCEOF

# ── api/v1/sync/status.php ───────────────────────────────
cat > api/v1/sync/status.php << 'EOF'
<?php
require_once __DIR__.'/../../../includes/cors.php';
require_once __DIR__.'/../../../includes/response.php';
require_once __DIR__.'/../../../includes/auth.php';
require_once __DIR__.'/../../../config/database.php';
requireRole(['admin']);
$pdo=getDB();
$stats=$pdo->query("SELECT COUNT(*) as total_events,MAX(processed_at) as last_sync FROM sync_logs")->fetch();
$c=['matches'=>$pdo->query("SELECT COUNT(*) FROM matches")->fetchColumn(),'players'=>$pdo->query("SELECT COUNT(*) FROM players")->fetchColumn(),'balls'=>$pdo->query("SELECT COUNT(*) FROM balls")->fetchColumn(),'wickets'=>$pdo->query("SELECT COUNT(*) FROM wickets")->fetchColumn()];
sendSuccess(['server_stats'=>$stats,'records'=>$c]);
EOF

# ── api/v1/upload/profile-picture.php ───────────────────
cat > api/v1/upload/profile-picture.php << 'EOF'
<?php
require_once __DIR__.'/../../../includes/cors.php';
require_once __DIR__.'/../../../includes/response.php';
require_once __DIR__.'/../../../includes/auth.php';
require_once __DIR__.'/../../../config/database.php';
requireAuth();
if ($_SERVER['REQUEST_METHOD']!=='POST') sendError('Method not allowed.',405);
if (empty($_FILES['profile_pic'])) sendError('No file uploaded.');
$f=$_FILES['profile_pic']; $pid=$_POST['player_id']??null;
$allowed=['image/jpeg','image/png','image/webp'];
if (!in_array($f['type'],$allowed)) sendError('Invalid file type.');
if ($f['size']>5*1024*1024) sendError('File too large. Max 5MB.');
if ($f['error']!==UPLOAD_ERR_OK) sendError('Upload error.');
$dir='/var/www/html/uploads/profiles/';
if (!is_dir($dir)) mkdir($dir,0755,true);
$ext=pathinfo($f['name'],PATHINFO_EXTENSION)?:'jpg';
$name='profile_'.uniqid().'_'.time().'.'.$ext;
if (!move_uploaded_file($f['tmp_name'],$dir.$name)) sendError('Failed to save file.',500);
$url='https://cricket.zodiactech.net/uploads/profiles/'.$name;
if ($pid) { $pdo=getDB(); $pdo->prepare("UPDATE players SET profile_pic=?,updated_at=NOW() WHERE local_id=? OR id=?")->execute([$url,$pid,$pid]); }
sendSuccess(['url'=>$url],'Profile picture uploaded.');
EOF

# ── api/v1/matches/list.php ──────────────────────────────
cat > api/v1/matches/list.php << 'EOF'
<?php
require_once __DIR__.'/../../../includes/cors.php';
require_once __DIR__.'/../../../includes/response.php';
require_once __DIR__.'/../../../includes/auth.php';
require_once __DIR__.'/../../../config/database.php';
requireAuth();
$pdo=getDB();
$matches=$pdo->query("SELECT m.*,ta.team_name as team_a_name,tb.team_name as team_b_name FROM matches m LEFT JOIN teams ta ON ta.id=m.team_a_id LEFT JOIN teams tb ON tb.id=m.team_b_id ORDER BY m.created_at DESC LIMIT 100")->fetchAll();
sendSuccess(['matches'=>$matches,'total'=>count($matches)]);
EOF

# ── Health check endpoint (public/health.php alias) ──────
cat > health.php << 'EOF'
<?php
header('Content-Type: application/json');
echo json_encode(['status'=>'ok','service'=>'CricZodiac API','version'=>'1.0','timestamp'=>date('c')]);
EOF

log "All application files written ✓"

# ── 5. Write MySQL Schema ─────────────────────────────────
info "Writing MySQL schema..."
cat > sql/schema.sql << 'SQLEOF'
CREATE DATABASE IF NOT EXISTS criczodiac CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE criczodiac;

CREATE TABLE IF NOT EXISTS users (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, email VARCHAR(150) UNIQUE NOT NULL, phone VARCHAR(20) UNIQUE, password_hash VARCHAR(255) NOT NULL, role ENUM('admin','umpire','player') NOT NULL DEFAULT 'player', status ENUM('active','blocked','pending') NOT NULL DEFAULT 'pending', is_approved TINYINT(1) NOT NULL DEFAULT 0, last_login DATETIME, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS players (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, local_id VARCHAR(36) UNIQUE, user_id INT UNSIGNED, full_name VARCHAR(100) NOT NULL, email VARCHAR(150), phone VARCHAR(20), player_type ENUM('batsman','bowler','allrounder') NOT NULL DEFAULT 'allrounder', profile_pic VARCHAR(500), is_active TINYINT(1) NOT NULL DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_user(user_id), INDEX idx_local(local_id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS teams (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, local_id VARCHAR(36) UNIQUE, match_id INT UNSIGNED, match_local_id VARCHAR(36), team_name VARCHAR(100) NOT NULL, team_label VARCHAR(2) NOT NULL DEFAULT 'A', captain_id INT UNSIGNED, captain_local_id VARCHAR(36), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS team_players (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, local_id VARCHAR(36) UNIQUE, team_id INT UNSIGNED, team_local_id VARCHAR(36), player_id INT UNSIGNED, player_local_id VARCHAR(36), batting_order TINYINT UNSIGNED DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS matches (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, local_id VARCHAR(36) UNIQUE, title VARCHAR(200) NOT NULL, venue VARCHAR(200), match_date DATE, overs TINYINT UNSIGNED DEFAULT 6, players_per_team TINYINT UNSIGNED DEFAULT 6, team_a_id INT UNSIGNED, team_b_id INT UNSIGNED, umpire_id INT UNSIGNED, toss_winner_id INT UNSIGNED, toss_choice VARCHAR(10), batting_first INT UNSIGNED, status ENUM('setup','toss','live','innings_2','completed') NOT NULL DEFAULT 'setup', result_text VARCHAR(500), winner_team_id INT UNSIGNED, player_of_match INT UNSIGNED, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_status(status), INDEX idx_local(local_id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS toss_results (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, local_id VARCHAR(36) UNIQUE, match_id INT UNSIGNED, match_local_id VARCHAR(36), toss_call ENUM('heads','tails') NOT NULL, toss_outcome ENUM('heads','tails') NOT NULL, toss_winner INT UNSIGNED, toss_winner_local VARCHAR(36), elected_to ENUM('bat','bowl') NOT NULL, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS innings (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, local_id VARCHAR(36) UNIQUE, match_id INT UNSIGNED, match_local_id VARCHAR(36), innings_number TINYINT UNSIGNED NOT NULL, batting_team_id INT UNSIGNED, batting_team_local VARCHAR(36), bowling_team_id INT UNSIGNED, bowling_team_local VARCHAR(36), total_runs SMALLINT UNSIGNED DEFAULT 0, total_wickets TINYINT UNSIGNED DEFAULT 0, total_overs DECIMAL(4,1) DEFAULT 0.0, extras SMALLINT UNSIGNED DEFAULT 0, is_completed TINYINT(1) DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_match(match_id), INDEX idx_local(local_id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS overs (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, local_id VARCHAR(36) UNIQUE, innings_id INT UNSIGNED, innings_local_id VARCHAR(36), over_number TINYINT UNSIGNED NOT NULL, bowler_id INT UNSIGNED, bowler_local_id VARCHAR(36), runs_conceded TINYINT UNSIGNED DEFAULT 0, wickets TINYINT UNSIGNED DEFAULT 0, is_maiden TINYINT(1) DEFAULT 0, balls_bowled TINYINT UNSIGNED DEFAULT 0, is_completed TINYINT(1) DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_innings(innings_id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS balls (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, local_id VARCHAR(36) UNIQUE, over_id INT UNSIGNED, over_local_id VARCHAR(36), innings_id INT UNSIGNED, innings_local_id VARCHAR(36), match_id INT UNSIGNED, match_local_id VARCHAR(36), ball_number TINYINT UNSIGNED NOT NULL, striker_id INT UNSIGNED, striker_local_id VARCHAR(36), non_striker_id INT UNSIGNED, non_striker_local_id VARCHAR(36), bowler_id INT UNSIGNED, bowler_local_id VARCHAR(36), runs_scored TINYINT UNSIGNED DEFAULT 0, is_wicket TINYINT(1) DEFAULT 0, is_extra TINYINT(1) DEFAULT 0, extra_type ENUM('wide','no_ball','bye','leg_bye','penalty'), extra_runs TINYINT UNSIGNED DEFAULT 0, is_four TINYINT(1) DEFAULT 0, is_six TINYINT(1) DEFAULT 0, is_valid_ball TINYINT(1) DEFAULT 1, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_innings(innings_id), INDEX idx_over(over_id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS wickets (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, local_id VARCHAR(36) UNIQUE, ball_id INT UNSIGNED, ball_local_id VARCHAR(36), innings_id INT UNSIGNED, innings_local_id VARCHAR(36), batsman_id INT UNSIGNED, batsman_local_id VARCHAR(36), bowler_id INT UNSIGNED, bowler_local_id VARCHAR(36), wicket_type ENUM('bowled','caught','run_out','lbw','stumped','hit_wicket','retired','other') NOT NULL, fielder_id INT UNSIGNED, fielder_local_id VARCHAR(36), runs_at_fall SMALLINT UNSIGNED DEFAULT 0, over_at_fall VARCHAR(10), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_innings(innings_id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS batting_scorecards (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, local_id VARCHAR(36) UNIQUE, innings_id INT UNSIGNED, innings_local_id VARCHAR(36), player_id INT UNSIGNED, player_local_id VARCHAR(36), runs_scored SMALLINT UNSIGNED DEFAULT 0, balls_faced SMALLINT UNSIGNED DEFAULT 0, fours TINYINT UNSIGNED DEFAULT 0, sixes TINYINT UNSIGNED DEFAULT 0, strike_rate DECIMAL(6,2) DEFAULT 0.00, is_out TINYINT(1) DEFAULT 0, dismissal_type VARCHAR(50), bowler_id INT UNSIGNED, bowler_local_id VARCHAR(36), fielder_id INT UNSIGNED, batting_order TINYINT UNSIGNED DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_innings(innings_id), INDEX idx_player(player_id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bowling_scorecards (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, local_id VARCHAR(36) UNIQUE, innings_id INT UNSIGNED, innings_local_id VARCHAR(36), player_id INT UNSIGNED, player_local_id VARCHAR(36), overs_bowled DECIMAL(4,1) DEFAULT 0.0, maidens TINYINT UNSIGNED DEFAULT 0, runs_conceded SMALLINT UNSIGNED DEFAULT 0, wickets TINYINT UNSIGNED DEFAULT 0, economy_rate DECIMAL(5,2) DEFAULT 0.00, no_balls TINYINT UNSIGNED DEFAULT 0, wides TINYINT UNSIGNED DEFAULT 0, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_innings(innings_id), INDEX idx_player(player_id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS match_results (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, local_id VARCHAR(36) UNIQUE, club_id INT UNSIGNED, series_id INT UNSIGNED, match_id INT UNSIGNED, match_local_id VARCHAR(36), winner_team_id INT UNSIGNED, winner_team_local VARCHAR(36), loser_team_id INT UNSIGNED, result_type ENUM('win','tie','no_result') NOT NULL DEFAULT 'win', margin SMALLINT UNSIGNED DEFAULT 0, margin_type ENUM('runs','wickets'), team_a_score VARCHAR(20), team_b_score VARCHAR(20), player_of_match INT UNSIGNED, player_of_match_local VARCHAR(36), result_text VARCHAR(500), created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_club(club_id), INDEX idx_series(series_id)) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sync_logs (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, event_id VARCHAR(36) UNIQUE NOT NULL, table_name VARCHAR(50) NOT NULL, action VARCHAR(20) NOT NULL, processed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_event(event_id)) ENGINE=InnoDB;
SQLEOF

# Seed with admin account
cat > sql/seed.sql << SEEDEOF
USE criczodiac;
INSERT IGNORE INTO users (name,email,phone,password_hash,role,status,is_approved,created_at)
VALUES ('Zodiac Admin','admin@zodiactech.net','+923000000001',
        '$(php -r "echo password_hash('Admin@CricZodiac2024!', PASSWORD_BCRYPT, ['cost'=>12]);" 2>/dev/null || echo '$2y$12$placeholder')',
        'admin','active',1,NOW());
SEEDEOF

log "SQL schema written ✓"

# ── 6. Build & Start Docker ───────────────────────────────
info "Building Docker image (this takes 2-3 minutes)..."
cd "$APP_DIR"

# Stop existing containers if running
docker compose down 2>/dev/null || true

# Build fresh
docker compose build --no-cache

info "Starting Docker containers..."
docker compose up -d

# Wait for MySQL
info "Waiting for MySQL to be ready..."
for i in $(seq 1 30); do
    if docker exec criczodiac_mysql mysqladmin ping -h localhost -u criczodiac_user \
       --password="$DB_PASSWORD" --silent 2>/dev/null; then
        log "MySQL is ready ✓"
        break
    fi
    echo -n "."
    sleep 3
done

# Update admin password properly
info "Setting admin password..."
HASH=$(docker exec criczodiac_app php -r \
  "echo password_hash('Admin@CricZodiac2024!', PASSWORD_BCRYPT, ['cost'=>12]);" 2>/dev/null || true)

if [[ -n "$HASH" ]]; then
    docker exec criczodiac_mysql mysql -u criczodiac_user \
      --password="$DB_PASSWORD" criczodiac \
      -e "INSERT IGNORE INTO users (name,email,phone,password_hash,role,status,is_approved,created_at) VALUES ('Zodiac Admin','admin@zodiactech.net','+923000000001','$HASH','admin','active',1,NOW()); UPDATE users SET password_hash='$HASH' WHERE email='admin@zodiactech.net';" 2>/dev/null || true
    log "Admin account configured ✓"
fi

log "Docker containers running ✓"
docker compose ps

# ── 7. Configure Host Nginx ───────────────────────────────
info "Configuring Nginx reverse proxy..."

cat > /etc/nginx/sites-available/criczodiac << NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;

    # Forward to Docker app
    location / {
        proxy_pass         http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Authorization     \$http_authorization;
        proxy_read_timeout 60s;
        client_max_body_size 10M;
    }
}
NGINXEOF

# Enable site
ln -sf /etc/nginx/sites-available/criczodiac /etc/nginx/sites-enabled/criczodiac
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

# Test & reload
nginx -t && systemctl reload nginx
log "Nginx configured ✓"

# ── 8. SSL Certificate ────────────────────────────────────
info "Obtaining SSL certificate for $DOMAIN..."
echo "Checking if $DOMAIN resolves to this server ($SERVER_IP)..."

RESOLVED=$(dig +short "$DOMAIN" 2>/dev/null | tail -1)
if [[ "$RESOLVED" == "$SERVER_IP" ]]; then
    log "DNS verified: $DOMAIN → $SERVER_IP"
    certbot --nginx -d "$DOMAIN" \
        --non-interactive \
        --agree-tos \
        --email "admin@zodiactech.net" \
        --redirect
    log "SSL certificate installed ✓"

    # Auto-renewal cron
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | crontab -
    log "SSL auto-renewal configured ✓"
else
    warn "DNS not yet propagated ($DOMAIN resolves to '$RESOLVED', expected '$SERVER_IP')"
    warn "SSL will be skipped for now. After DNS propagates, run:"
    warn "  certbot --nginx -d $DOMAIN --non-interactive --agree-tos --email admin@zodiactech.net --redirect"
fi

# ── 9. Setup Backup Cron ──────────────────────────────────
info "Setting up automated backups..."
mkdir -p /opt/backups

cat > /opt/criczodiac/backup.sh << 'BKEOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
docker exec criczodiac_mysql mysqldump \
  -u criczodiac_user --password="${DB_PASSWORD:-CricZ0diac@DB#2024!Secure}" \
  --single-transaction criczodiac \
  > /opt/backups/criczodiac_$DATE.sql 2>/dev/null
find /opt/backups -name "*.sql" -mtime +30 -delete
echo "[$(date)] Backup: criczodiac_$DATE.sql"
BKEOF
chmod +x /opt/criczodiac/backup.sh

(crontab -l 2>/dev/null; echo "0 2 * * * /opt/criczodiac/backup.sh >> /var/log/criczodiac-backup.log 2>&1") | crontab -
log "Daily backup cron set (2 AM) ✓"

# ── 10. Final Tests ───────────────────────────────────────
echo ""
info "Running API tests..."
sleep 3

# Test via internal port
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/health 2>/dev/null)
if [[ "$HTTP_CODE" == "200" ]]; then
    log "Health check passed (HTTP $HTTP_CODE) ✓"
else
    warn "Health check returned HTTP $HTTP_CODE"
fi

# Test login API
LOGIN_RESULT=$(curl -s -X POST http://127.0.0.1:8090/api/v1/auth/login.php \
  -H "Content-Type: application/json" \
  -d '{"email_or_phone":"admin@zodiactech.net","password":"Admin@CricZodiac2024!"}' 2>/dev/null)

if echo "$LOGIN_RESULT" | grep -q '"success":true'; then
    log "Login API working ✓"
else
    warn "Login test: $LOGIN_RESULT"
fi

# ── Done ──────────────────────────────────────────────────
echo ""
echo -e "${WHITE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${WHITE}║          🏏  CricZodiac DEPLOYED!                    ║${NC}"
echo -e "${WHITE}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${WHITE}║  API Base:   ${CYAN}https://$DOMAIN/api/v1${WHITE}      ║${NC}"
echo -e "${WHITE}║  Health:     ${CYAN}https://$DOMAIN/health${WHITE}         ║${NC}"
echo -e "${WHITE}║  Admin:      ${CYAN}admin@zodiactech.net${WHITE}               ║${NC}"
echo -e "${WHITE}║  Password:   ${CYAN}Admin@CricZodiac2024!${WHITE}              ║${NC}"
echo -e "${WHITE}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${WHITE}║  DNS REQUIRED (Hostinger Panel):                     ║${NC}"
echo -e "${WHITE}║  Add A Record: cricket → ${CYAN}$SERVER_IP${WHITE}       ║${NC}"
echo -e "${WHITE}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}Container Status:${NC}"
docker compose -f $APP_DIR/docker-compose.yml ps
echo ""
echo -e "${GREEN}Backup location:${NC} /opt/backups/"
echo -e "${GREEN}Logs:${NC}            docker compose -f $APP_DIR/docker-compose.yml logs -f"
echo -e "${GREEN}Restart:${NC}         docker compose -f $APP_DIR/docker-compose.yml restart"
