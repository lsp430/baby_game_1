// ==================== 模块引入与配置 ====================
const { Engine, Render, World, Bodies, Runner, Events, Body, MouseConstraint, Mouse, Vector } = Matter;

const container = document.getElementById('game-container');
const MAX_SHAPES = 20;
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
let soundShow, soundCollision, soundFirework;
let touchStartTime = 0; // 用于判断短触
let lastCollisionSoundTime = 0; //碰撞音效的节流时间

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

// 【修正】：createFirework 函数不再接受 color 参数，实现多色烟花
function createFirework(x, y) { 
    // 【增强】：烟花爆炸播放音效 3
    playSound(soundFirework); 
	playRandomSound(soundXiaohaiList);
	playRandomSound(soundGoodList);

    const numParticles = 20; 
    for (let i = 0; i < numParticles; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const angle = Math.random() * 2 * Math.PI;
        const distance = getRandom(50, 150); 
        
        // 为每个粒子随机选择颜色
        const randomColor = COLORS[getRandom(0, COLORS.length - 1)];
        particle.style.setProperty('--color', randomColor); 
        
        particle.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
        particle.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        container.appendChild(particle);
        setTimeout(() => particle.remove(), 800); 
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


// ==================== 核心：Matter.js 初始化 ====================

function initMatter() {
    engine = Engine.create({ gravity: { scale: 0, x: 0, y: 0 } });
    world = engine.world;
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
    const wallThickness = 50; 
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
    });

    Events.on(mouseConstraint, 'mouseup', () => {
        const touchDuration = Date.now() - touchStartTime;
        // 如果持续时间小于 200ms 且鼠标约束抓住了物体 (即点击了物理体)
        if (touchDuration < 200 ) {
            playRandomSound(soundTapList);
        }
    });

    
    // 3. 实时同步 & 摩擦减速 (保持不变)
    Events.on(engine, 'beforeUpdate', () => {
        gameBodies.forEach(body => {
            const el = body.htmlElement;
            if (el) {
                
                if (body.isAnimating) {
                    const speed = Vector.magnitude(body.velocity);
                    if (speed > 0.05) {
                        Body.setVelocity(body, Vector.mult(body.velocity, 0.98));
                    } else if (speed > 0) {
                        Body.setVelocity(body, { x: 0, y: 0 });
                    }
                    return; 
                }

                // 物理定位 
                el.style.position = 'absolute';
				el.style.left = `${body.position.x - SHAPE_RADIUS}px`;
				el.style.top  = `${body.position.y - SHAPE_RADIUS}px`;
				el.style.transform = `rotate(${body.angle}rad)`;
                
                // 摩擦减速
                const speed = Vector.magnitude(body.velocity);
                if (speed > 0.05) {
                    Body.setVelocity(body, Vector.mult(body.velocity, 0.98));
                } else if (speed > 0) {
                    Body.setVelocity(body, { x: 0, y: 0 });
                }
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
    createFirework(removedBody.position.x, removedBody.position.y);
    
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
        const newContent = currentContentList[getRandom(0, currentContentList.length - 1)];
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
        const content = currentContentList[getRandom(0, currentContentList.length - 1)];
        const color = COLORS[getRandom(0, COLORS.length - 1)];

        createPhysicsShape(content, color);
        
        count++;
        if (count >= itemsToGenerate || gameBodies.length >= MAX_SHAPES) { 
            clearInterval(interval);
        }
    }, 200);
}

function playRandomSound(soundList) {
    if (soundList.length === 0) return;

    const index = Math.floor(Math.random() * soundList.length);
    const sound = soundList[index];

    playSound(sound);
}

document.getElementById('numbers-btn').onclick = () => setCategory('numbers');
document.getElementById('letters-btn').onclick = () => setCategory('letters');
document.getElementById('animals-btn').onclick = () => setCategory('animals');
document.getElementById('fruits-btn').onclick = () => setCategory('fruits');

document.getElementById('add-random-btn').onclick = () => {
    const content = currentContentList[getRandom(0, currentContentList.length - 1)];
    const color = COLORS[getRandom(0, COLORS.length - 1)];
    createPhysicsShape(content, color);
};


// 初始化
window.onload = () => {
    initSounds(); // 【新增】初始化音效
    initMatter();
    setCategory('numbers'); 
};