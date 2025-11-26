// ==================== 模块引入与配置 ====================
const { Engine, Render, World, Bodies, Runner, Events, Body, MouseConstraint, Mouse, Vector } = Matter;

const container = document.getElementById('game-container');
const MAX_SHAPES = 15;
const SHAPE_RADIUS = 40; 
const COLLISION_CATEGORY_SHAPE = 0x0001;
const COLLISION_CATEGORY_WALL = 0x0002;

// 全局常量
const TOP_BOUNDARY_HEIGHT = 70; 

const COLORS = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#FFC300', '#DAF7A6', '#4CC9F0', '#B5179E']; 

const CONTENT_POOL = {
    numbers: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    letters: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'],
    animals: ['🐶', '🐱', '🐰', '🐻', '🐼', '🐯', '🦁', '🐷', '🐸', '🦉'],
    fruits: ['🍎', '🍊', '🍌', '🍇', '🍓', '🍍', '🍉', '🍑', '🍒', '🥝']
};

let activeCategory = 'numbers'; 
let currentContentList = CONTENT_POOL[activeCategory]; 
let engine, world, runner;
let mouseConstraint; 

const gameBodies = []; 

// 【音效变量】
let soundTapList = [];      // 点击音效池（多个音效）
let soundXiaohaiList = [];      // xiaohai音效池（多个音效）
let soundGoodList = [];      // good音效池（多个音效）
let bgmList = [];
let currentBgm = null;
let soundShow, soundCollision, soundFirework;
let touchStartTime = 0; // 用于判断短触
let lastCollisionSoundTime = 0; //碰撞音效的节流时间

// 👇 新增：用于“连续点击合成”的状态
let lastSelectedBody = null;         // 上一次点击到的泡泡
let lastSelectedTime = 0;            // 上一次点击时间戳
let currentDownBody = null;          // 当前按下时选中的泡泡
const TAP_COMBINE_INTERVAL = 5000;    // 两次点之间的最大间隔(ms)，比如 5000 毫秒内视为一对
let bgmStarted = false;
let activeParticles = 0;   // 当前在屏幕上的粒子数
const MAX_PARTICLES = 200; // 同屏粒子上限

// ============ Canvas 烟花相关 ============
let fireworkCanvas, fireworkCtx;
const fireworkParticles = [];
const MAX_FIREWORK_PARTICLES = 400; // 同屏粒子上限，防止卡顿

// 连击：短时间内连续多次融合 → combo 变大
let lastFusionTime = 0;
let comboCount = 0;
const COMBO_RESET_INTERVAL = 10000; // ms 内再次融合算连击

// Combo 提示
let comboToastTimeout = null;

// ==================== 音效控制函数 ====================

function initSounds() {
	soundTapList = [
        document.getElementById('sound-tap-1'),
        document.getElementById('sound-tap-2'),
        document.getElementById('sound-tap-3'),
        document.getElementById('sound-tap-4'),
        document.getElementById('sound-tap-5'),
        document.getElementById('sound-tap-6'),
    ];
	soundXiaohaiList = [
        document.getElementById('sound-xiaohai-1'),
        document.getElementById('sound-xiaohai-2'),
        document.getElementById('sound-xiaohai-3')
    ];
	soundGoodList = [
        document.getElementById('sound-type-1'),
        document.getElementById('sound-type-2'),
        document.getElementById('sound-type-3'),
        document.getElementById('sound-type-4')
    ];
    bgmList = [
        document.getElementById('bgm-1'),
        document.getElementById('bgm-2'),
        document.getElementById('bgm-3')
    ];
    soundShow = document.getElementById('sound-chuxian');
    soundCollision = document.getElementById('sound-collision');
    soundFirework = document.getElementById('sound-firework');
}

/**
 * 播放音效，并确保音效可以被快速重复播放
 * @param {HTMLAudioElement} soundElement 
 */
function playSound(soundElement) {
    if (soundElement) {
        // 将播放时间重置到 0，以确保即使正在播放也能立即重新开始
        soundElement.currentTime = 0; 
        soundElement.play().catch(error => {
            // 捕获浏览器自动播放限制的错误
            // console.error("Audio playback failed:", error); 
        });
    }
}


// ==================== 实用函数与烟花 ====================
const getRandom = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// 👇 新增：根据数量决定内容来源
function getRandomContentForNewShape() {
    // 当界面元素超过 10 个时，从已有元素中随机拿一个内容
    if (gameBodies.length > 10) {
        const idx = getRandom(0, gameBodies.length - 1);
        return gameBodies[idx].htmlContent;
    }

    // 否则按原逻辑，从当前类别的内容池中取
    return currentContentList[getRandom(0, currentContentList.length - 1)];
}

function showComboToast(comboLevel) {
    const toast = document.getElementById('combo-toast');
    if (!toast) return;

    // Combo 文案
    toast.textContent = `Combo x${comboLevel}!`;

    // 根据 comboLevel 设置颜色（可选）
    const colors = [
        '#FF5733', // Combo1
        '#FF8C00', // Combo2
        '#FFD000', // Combo3
        '#32CD32', // Combo4
        '#4CC9F0', // Combo5
    ];
    toast.style.color = colors[Math.min(comboLevel - 1, colors.length - 1)];

    // 先移除所有 class，重置动画
    toast.classList.remove('show', 'fade');
    void toast.offsetWidth; // ✨ 强制重绘，让动画能重新触发

    // 显示动画
    toast.classList.add('show');

    // 如果之前有 fade 计时器，清除掉
    if (comboToastTimeout) {
        clearTimeout(comboToastTimeout);
    }

    // 延迟 500ms 后开始淡出
    comboToastTimeout = setTimeout(() => {
        toast.classList.add('fade');
    }, 500);

    // 再过 700ms 完全消失
    setTimeout(() => {
        toast.classList.remove('show', 'fade');
    }, 1200);
}

function triggerComboFirework(x, y) {
    const now = Date.now();

    if (now - lastFusionTime <= COMBO_RESET_INTERVAL) {
        comboCount++;
    } else {
        comboCount = 1;
    }
    lastFusionTime = now;

    const comboLevel = Math.min(comboCount, 5);

    // 🎉 显示 Combo 提示
    if (comboLevel > 1) {
        showComboToast(comboLevel);
    }

    createFirework(x, y, comboLevel);
}



// 【修正】：createFirework 函数不再接受 color 参数，实现多色烟花
function createFirework(x, y, comboLevel = 1) { 
    // 🔊 保留音效
    playSound(soundFirework); 
    playRandomSound(soundXiaohaiList);
    playRandomSound(soundGoodList);

    // 粒子太多就只播音效，避免卡
    if (fireworkParticles.length > MAX_FIREWORK_PARTICLES) {
        return;
    }

    // ===== 连击强度（1~5），用于放大烟花规模 =====
    const power = Math.min(Math.max(comboLevel, 1), 5);

    // ===== 1. 大爆炸：两圈主粒子 =====
    const baseInnerCount = 10;
    const baseOuterCount = 14;

    const rings = [
        {
            // 内圈，连击越高粒子越多/半径略大
            count: baseInnerCount + power * 2,
            minDist: 25,
            maxDist: 45 + power * 5
        },
        {
            // 外圈，连击越高爆得更开
            count: baseOuterCount + power * 3,
            minDist: 45 + power * 5,
            maxDist: 90 + power * 12
        }
    ];

    rings.forEach((ring) => {
        for (let i = 0; i < ring.count; i++) {
            if (fireworkParticles.length > MAX_FIREWORK_PARTICLES) return;

            const t = i / ring.count;
            const baseAngle = t * Math.PI * 2;
            const randomOffset = (Math.random() - 0.5) * (Math.PI / 10);
            const angle = baseAngle + randomOffset;

            const distance = getRandom(ring.minDist, ring.maxDist);

            // 根据 power 调整初速度，连击越高爆得越开
            const speed = distance / getRandom(18 - power, 26 - power); 
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            const color = COLORS[getRandom(0, COLORS.length - 1)];

            // 大粒子：连击越高越大一点
            const size = getRandom(3 + power * 0.3, 5 + power * 0.5);
            const maxLife = getRandom(32 + power * 3, 45 + power * 4);

            fireworkParticles.push({
                x,
                y,
                vx,
                vy,
                size,
                color,
                life: 0,
                maxLife
            });
        }
    });

    // ===== 2. 小碎星：从爆心向下掉落的闪烁星星 =====
    const fragmentBaseCount = 6;
    const fragmentCount = fragmentBaseCount + power * 2;

    for (let i = 0; i < fragmentCount; i++) {
        if (fireworkParticles.length > MAX_FIREWORK_PARTICLES) break;

        const angleSpread = (Math.random() - 0.5) * (Math.PI / 3); // 上下小角度
        const speed = getRandom(1, 2) + power * 0.3;
        const vx = Math.cos(angleSpread) * speed * 0.3;  // X 小，主要向下
        const vy = Math.sin(angleSpread) * speed + 1.5;  // 往下 + 重力感

        const color = COLORS[getRandom(0, COLORS.length - 1)];
        const size = getRandom(2, 3);                    // 碎星更小
        const maxLife = getRandom(35, 55);

        fireworkParticles.push({
            x,
            y,
            vx,
            vy,
            size,
            color,
            life: 0,
            maxLife
        });
    }

    // ===== 3. 爆心闪光：几颗白色短命亮点 =====
    const centerCount = 4 + power; // 连击越高，中间亮点多一点
    for (let i = 0; i < centerCount; i++) {
        if (fireworkParticles.length > MAX_FIREWORK_PARTICLES) break;

        const jitterX = getRandom(-4, 4);
        const jitterY = getRandom(-4, 4);

        const color = '#ffffff';
        const size = 2.5 + power * 0.2;
        const maxLife = getRandom(12, 20);

        fireworkParticles.push({
            x: x + jitterX,
            y: y + jitterY,
            vx: 0,
            vy: 0,
            size,
            color,
            life: 0,
            maxLife
        });
    }
}

// ==================== 提示条控制函数 (保持不变) ====================
let toastTimeout;

function showToast(message) {
    const toast = document.getElementById('notification-toast');
    
    clearTimeout(toastTimeout);
    
    toast.textContent = message;
    toast.classList.add('show');

    // 3秒后隐藏提示条
    toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000); 
}

function updateFireworks() {
    requestAnimationFrame(updateFireworks);
    if (!fireworkCtx || !fireworkCanvas) return;

    const w = fireworkCanvas.width;
    const h = fireworkCanvas.height;

    // ⭐ 没有粒子：直接清空，防止残留
    if (fireworkParticles.length === 0) {
        fireworkCtx.clearRect(0, 0, w, h);
        return;
    }

    // ⭐ 有粒子：用半透明背景“冲淡”上一帧，形成拖尾
    // body 背景是 #F0F4F8 = rgb(240,244,248)，保持一致避免颜色块
    fireworkCtx.fillStyle = 'rgba(240,244,248,0.08)'; // alpha 越小拖尾越淡
    fireworkCtx.fillRect(0, 0, w, h);

    // 更新 & 绘制粒子
    for (let i = fireworkParticles.length - 1; i >= 0; i--) {
        const p = fireworkParticles[i];

        p.life++;
        if (p.life >= p.maxLife) {
            fireworkParticles.splice(i, 1);
            continue;
        }

        // 速度更新
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985; // 阻尼
        p.vy *= 0.985;
        p.vy += 0.03;  // 轻微重力

        // 透明度随生命衰减
        const alpha = 1 - p.life / p.maxLife;

        fireworkCtx.globalAlpha = alpha;
        fireworkCtx.beginPath();
        fireworkCtx.fillStyle = p.color;
        fireworkCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        fireworkCtx.fill();
    }

    fireworkCtx.globalAlpha = 1; // 重置
}

function initFireworkCanvas() {
    // 创建一个全屏 Canvas 覆盖在游戏上面
    fireworkCanvas = document.createElement('canvas');
    fireworkCanvas.id = 'firework-canvas';
    fireworkCanvas.style.position = 'fixed';
    fireworkCanvas.style.left = '0';
    fireworkCanvas.style.top = '0';
    fireworkCanvas.style.width = '100%';
    fireworkCanvas.style.height = '100%';
    fireworkCanvas.style.pointerEvents = 'none'; // 不挡点击
    fireworkCanvas.style.zIndex = '8';           // 在 Matter canvas 之上，形状(.shape-html zIndex=10)之下

    document.body.appendChild(fireworkCanvas);

    const resize = () => {
        fireworkCanvas.width = window.innerWidth;
        fireworkCanvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    fireworkCtx = fireworkCanvas.getContext('2d');

    // 启动渲染循环
    requestAnimationFrame(updateFireworks);
}

// ==================== 核心：Matter.js 初始化 ====================

function initMatter() {
    engine = Engine.create({ gravity: { scale: 0, x: 0, y: 0 } });
    world = engine.world;

    // ⭐ 降低迭代次数，减轻手机压力
    engine.positionIterations   = 4; // 默认 6
    engine.velocityIterations   = 3; // 默认 4
    engine.constraintIterations = 2; // 默认 2，保持不变或也能调成 1

    const cw = window.innerWidth;
    const ch = window.innerHeight;

    const render = Render.create({
        element: container, engine: engine,
        options: {
            width: cw, height: ch, wireframes: false, background: 'transparent', 
            showBodies: false, showDebug: false 
        }
    });

    Render.run(render);
    runner = Runner.run(engine);

    // 1. 创建边界 (墙壁)
    const wallThickness = 2; 
    const wallVisualOffset = wallThickness / 2;
    
    const wallOptions = { 
        isStatic: true, 
        restitution: 0.8, 
        friction: 0.01, 
        collisionFilter: { category: COLLISION_CATEGORY_WALL },
        render: {
             fillStyle: '#105C01', // 深绿色边框
             lineWidth: 2, 
             visible: false 
        }
    };
    
    World.add(world, [
        // 顶部墙
        Bodies.rectangle(cw / 2, TOP_BOUNDARY_HEIGHT, cw, wallThickness, wallOptions),
        // 底部墙
        Bodies.rectangle(cw / 2, ch - wallVisualOffset, cw, wallThickness, wallOptions),
        // 左侧墙
        Bodies.rectangle(wallVisualOffset, ch / 2, wallThickness, ch, wallOptions),
        // 右侧墙
        Bodies.rectangle(cw - wallVisualOffset, ch / 2, wallThickness, ch, wallOptions)
    ]);

    // 2. 鼠标/触摸交互
    const mouse = Mouse.create(render.canvas);
    mouseConstraint = MouseConstraint.create(engine, { 
        mouse: mouse, constraint: { stiffness: 0.2, render: { visible: false } }
    });
    World.add(world, mouseConstraint);
    
    // 【音效修正】：监听鼠标按下和松开事件，实现点击/短触音效 (音效 1)
    Events.on(mouseConstraint, 'mousedown', () => {
        touchStartTime = Date.now();
        // 记录当前被鼠标选中的物体（可能是 null）
        currentDownBody = mouseConstraint.body;
    });

    Events.on(mouseConstraint, 'mouseup', () => {
        const touchDuration = Date.now() - touchStartTime;
        const clickedBody = currentDownBody;
        currentDownBody = null; // 用完清理

        // 如果持续时间小于 200ms 且鼠标约束抓住了物体 (即点击了物理体)
        if (touchDuration < 200 ) {
            playRandomSound(soundTapList);

            // 如果确实点在了某个泡泡上，就走“连续点击判定”
            if (clickedBody && clickedBody.htmlContent) {
                handleTapSelection(clickedBody);
            }
        }
    });

    
    // 3. 实时同步 & 摩擦减速 (保持不变)
    Events.on(engine, 'beforeUpdate', () => {
        const cw = window.innerWidth;
        const ch = window.innerHeight;

        // 全部元素统一的边界（圆心范围）
        const minX = SHAPE_RADIUS;
        const maxX = cw - SHAPE_RADIUS;
        const minY = TOP_BOUNDARY_HEIGHT + SHAPE_RADIUS; // 顶部留出按钮区域
        const maxY = ch - SHAPE_RADIUS;

        gameBodies.forEach(body => {
            // 1）先做位置夹紧（无论是否在动画或拖动）
            let { x, y } = body.position;

            if (x < minX) x = minX;
            if (x > maxX) x = maxX;
            if (y < minY) y = minY;
            if (y > maxY) y = maxY;

            if (x !== body.position.x || y !== body.position.y) {
                Body.setPosition(body, { x, y });
                // 被推回边缘时把速度清掉，避免一直朝外冲
                Body.setVelocity(body, { x: 0, y: 0 });
            }

            const el = body.htmlElement;
            if (!el) return;

            // 2）果冻动画期间：只做减速，不更新 transform（防止和 CSS 动画打架）
            if (body.isAnimating) {
                const speed = Vector.magnitude(body.velocity);
                // 只在“快停下来的时候”清零，其他时候交给 frictionAir 处理
                if (speed > 0 && speed < 0.02) {
                    Body.setVelocity(body, { x: 0, y: 0 });
                }
                return;
            }

            // 3）正常状态：同步 DOM 位置
            el.style.position = 'absolute';
            el.style.left = `${body.position.x - SHAPE_RADIUS}px`;
            el.style.top  = `${body.position.y - SHAPE_RADIUS}px`;

            // 数字 6 / 9 不旋转，其它正常旋转
            if (body.htmlContent === '6' || body.htmlContent === '9') {
                el.style.transform = 'rotate(0deg)';
            } else {
                el.style.transform = `rotate(${body.angle}rad)`;
            }

            // 4）摩擦减速
            const speed = Vector.magnitude(body.velocity);
            if (speed > 0.05) {
                Body.setVelocity(body, Vector.mult(body.velocity, 0.98));
            } else if (speed > 0) {
                Body.setVelocity(body, { x: 0, y: 0 });
            }
        });
    });

    // 4. 监听碰撞事件，触发融合/动画
    Events.on(engine, 'collisionStart', (event) => {
		const pairs = event.pairs;
		const now = Date.now();

		pairs.forEach(pair => {
			const bodyA = pair.bodyA;
			const bodyB = pair.bodyB;

			const isSameContent =
				bodyA.htmlContent &&
				bodyB.htmlContent &&
				bodyA.htmlContent === bodyB.htmlContent;

			// ============ 碰撞音效逻辑 ============
			if (isSameContent) {
				// 相同内容碰撞：一定播放音效（不受 200ms 限制）
				playSound(soundCollision);
			} else {
				// 普通碰撞：200ms 内只播一次
				if (now - lastCollisionSoundTime > 200) {
					playSound(soundCollision);
					lastCollisionSoundTime = now;
				}
			}
			// ========== 以上是音效处理 ==========

			// 后面是你原来的相同内容融合逻辑
			if (isSameContent) {

				if (!bodyA.isProcessing && !bodyB.isProcessing) {
					showToast(`🎉 ${bodyA.htmlContent} 和 ${bodyB.htmlContent} 发生碰撞！`);
					
					bodyA.isProcessing = true;
					bodyB.isProcessing = true;
					
					let animatedBody = bodyA;
					let removedBody = bodyB;
					
					const draggingBody = mouseConstraint.body;

					if (draggingBody) {
						if (draggingBody === bodyB) {
							animatedBody = bodyB;
							removedBody = bodyA;
						}
					} else {
						if (Math.random() < 0.5) {
							animatedBody = bodyB;
							removedBody = bodyA;
						}
					}
					
					setTimeout(() => processFusion(animatedBody, removedBody), 50); 
				}
			}
		});
	});

    // 窗口大小变化处理
    window.addEventListener('resize', () => { window.location.reload(); });
}

// ==================== 碰撞融合处理 (带果冻动画) ====================

function processFusion(animatedBody, removedBody) {
    if (!animatedBody || !removedBody || !animatedBody.isProcessing || !removedBody.isProcessing) {
        if (animatedBody) animatedBody.isProcessing = false;
        if (removedBody) removedBody.isProcessing = false;
        return;
    }
    
    // 1. 触发烟花效果 (此函数内部会播放音效 3)
    triggerComboFirework(animatedBody.position.x, animatedBody.position.y);
    
    // 2. 立即从 DOM 移除消失体
    removedBody.htmlElement.remove();
    
    // 3. 立即从我们的追踪数组中移除消失体
    const indexR = gameBodies.findIndex(b => b.id === removedBody.id);
    if (indexR !== -1) gameBodies.splice(indexR, 1);

    // 4. 从 Matter.js 世界中移除物理体
    if (world.bodies.includes(removedBody)) { 
        World.remove(world, removedBody);
    }
    
    // 5. 动画元素处理
    animatedBody.isAnimating = true;
    Body.setStatic(animatedBody, true);
    animatedBody.htmlElement.classList.add('jelly-transform');


    // 6. 动画结束后（500ms），清除标志并补充生成新元素
    setTimeout(() => {
        
        animatedBody.htmlElement.classList.remove('jelly-transform');
        
        animatedBody.isAnimating = false;
        Body.setStatic(animatedBody, false);
        
        Body.setVelocity(animatedBody, { 
            x: getRandom(-2, 2), 
            y: getRandom(-2, 2) 
        });

        animatedBody.isProcessing = false; 
        
        // 补充生成一个新元素
        const newContent = getRandomContentForNewShape();
        const newColor = COLORS[getRandom(0, COLORS.length - 1)];
        createPhysicsShape(newContent, newColor);
        
    }, 500); 
}


// ==================== 其他函数 (createPhysicsShape, setCategory) ====================

function createPhysicsShape(content, color) { 
    if (gameBodies.length >= MAX_SHAPES) {
        console.log("达到最大形状限制");
        return;
    }
	
	playSound(soundShow); 

    const cw = window.innerWidth;
    const ch = window.innerHeight;
    
    const x = getRandom(SHAPE_RADIUS * 2, cw - SHAPE_RADIUS * 2);
    const y = getRandom(TOP_BOUNDARY_HEIGHT + SHAPE_RADIUS, ch - SHAPE_RADIUS * 2); 

    const el = document.createElement('div');
    el.className = 'shape-html';
    el.style.backgroundColor = color;
    el.textContent = content; 
    container.appendChild(el);

    const body = Bodies.circle(x, y, SHAPE_RADIUS, {
		restitution: 0.8,
		frictionAir: 0.05,
		density: 0.001,
		collisionFilter: { category: COLLISION_CATEGORY_SHAPE },
		render: {
			visible: false // 关键：不让 Matter 自己画这个圆
		}
	});

    body.htmlElement = el;
    body.htmlContent = content; 
    body.htmlColor = color;
    body.id = Date.now() + Math.random(); 
    body.isAnimating = false; 

    Body.setVelocity(body, { 
        x: getRandom(-3, 3), 
        y: getRandom(-3, 3) 
    });

    World.add(world, body);
    gameBodies.push(body);
}

function setCategory(category) { 
    if (activeCategory === category && gameBodies.length > 0) return; 

    document.querySelectorAll('.control-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${category}-btn`).classList.add('active');

    activeCategory = category;
    currentContentList = CONTENT_POOL[category];

    World.remove(world, gameBodies);
    gameBodies.forEach(body => body.htmlElement.remove());
    gameBodies.length = 0; 

    let count = 0;
    const itemsToGenerate = 5; 

    const interval = setInterval(() => {
        const content = getRandomContentForNewShape();
        const color = COLORS[getRandom(0, COLORS.length - 1)];

        createPhysicsShape(content, color);
        
        count++;
        if (count >= itemsToGenerate || gameBodies.length >= MAX_SHAPES) { 
            clearInterval(interval);
        }
    }, 200);
}

/**
 * 处理“连续点击两个相同内容泡泡”的逻辑
 * @param {Body} body 本次点击到的泡泡
 */
function handleTapSelection(body) {
    const now = Date.now();

    // 同一个泡泡被狂点：只更新时间，不触发合成
    if (lastSelectedBody === body) {
        lastSelectedTime = now;
        return;
    }

    const hasPrev = !!lastSelectedBody;
    const inTime = now - lastSelectedTime <= TAP_COMBINE_INTERVAL;
    const sameContent =
        hasPrev &&
        lastSelectedBody.htmlContent === body.htmlContent;

    if (
        hasPrev &&
        inTime &&
        sameContent &&
        !lastSelectedBody.isProcessing &&
        !body.isProcessing
    ) {
        // ✅ 满足条件：两次连续点击到不同的、相同内容的泡泡 → 视为碰撞合成

        const bodyA = lastSelectedBody;
        const bodyB = body;

        bodyA.isProcessing = true;
        bodyB.isProcessing = true;

        showToast(`👏 连续点中两个 ${body.htmlContent} ！`);

        // 规则：让“第二次点击”的泡泡做果冻动画，第一次的消失
        const animatedBody = bodyB;
        const removedBody = bodyA;

        setTimeout(() => processFusion(animatedBody, removedBody), 50);

        // 用完这对后清空记录，避免重复使用同一对
        lastSelectedBody = null;
        lastSelectedTime = 0;
    } else {
        // 不满足合成条件：只更新“上一次选择”的记录
        lastSelectedBody = body;
        lastSelectedTime = now;
    }
}

function playRandomSound(soundList) {
    if (soundList.length === 0) return;

    const index = Math.floor(Math.random() * soundList.length);
    const sound = soundList[index];

    playSound(sound);
}

function playRandomBgm() {
    // 停掉上一个 BGM（如果有）
    if (currentBgm) {
        currentBgm.pause();
        currentBgm.currentTime = 0;
    }

    // 随机挑一个背景音乐
    const index = Math.floor(Math.random() * bgmList.length);
    currentBgm = bgmList[index];

    currentBgm.volume = 1; // 可调：背景音乐音量
    currentBgm.play().catch(() => {});

    // ⭐ 当 BGM 播放结束，自动随机播放下一首
    currentBgm.onended = () => {
        playRandomBgm();  // 递归式循环
    };
}

function startBgmOnce() {
    if (!bgmStarted) {
        bgmStarted = true;
        playRandomBgm();
    }
}

document.getElementById('numbers-btn').onclick = () => setCategory('numbers');
document.getElementById('letters-btn').onclick = () => setCategory('letters');
document.getElementById('animals-btn').onclick = () => setCategory('animals');
document.getElementById('fruits-btn').onclick = () => setCategory('fruits');

document.getElementById('add-random-btn').onclick = () => {
    const content = getRandomContentForNewShape();
    const color = COLORS[getRandom(0, COLORS.length - 1)];
    createPhysicsShape(content, color);
};


// 初始化
window.onload = () => {
    initSounds(); // 【新增】初始化音效
    initFireworkCanvas(); // 初始化烟花 Canvas
    initMatter();
    setCategory('numbers'); 
    // 必须在第一次用户点击后播放
    window.addEventListener('touchstart', startBgmOnce, { once: true });
    window.addEventListener('mousedown', startBgmOnce, { once: true });
};