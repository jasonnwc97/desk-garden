// main.js

// 1) PreloadScene: just load the desk background
class PreloadScene extends Phaser.Scene {
  constructor() { super('Preload'); }
  preload() {
    this.load.image('desk', 'assets/desk.jpg');
  }
  create() {
    this.scene.start('Main');
  }
}

// 2) MainScene: garden, achievements, cloud rain
class MainScene extends Phaser.Scene {
  constructor() {
    super('Main');

    // game state
    this.soil        = 0;
    this.sprinkler   = 0;
    this.potLevel    = 0;
    this.clouds      = 0;
    this.waterClicks = 0;
    this.achieved    = [];

    // flower emoji cycle
    this.flowerStages = ['🌱','🌿','🌼','🌸'];

    // 8 achievements: 5 click-based + 3 event-based
    this.achDefs = [
      { key:'firstClick',      clicks:1,      text:'🏆 First Click!'        },
      { key:'fiveClicks',      clicks:5,      text:'🏆 5 Clicks!'           },
      { key:'hundredClicks',   clicks:100,    text:'🏆 100 Clicks!'         },
      { key:'thousandClicks',  clicks:1000,   text:'🏆 1 000 Clicks!'       },
      { key:'tenKClicks',      clicks:10000,  text:'🏆 10 000 Clicks!'      },
      { key:'boughtSprinkler', event:'sprinkler', text:'🏆 Bought Sprinkler!' },
      { key:'boughtCloud',     event:'clouds',    text:'🏆 Bought Cloud!'     },
      { key:'upgradedPot',     event:'potLevel',  text:'🏆 Upgraded Pot!'     }
    ];
  }

  create() {
    const { width:w, height:h } = this.scale;

    // background
    this.bg = this.add.image(0, 0, 'desk')
      .setOrigin(0)
      .setDisplaySize(w, h);
    this.scale.on('resize', this.onResize, this);

    // restore state + offline catch-up
    const data = JSON.parse(localStorage.getItem('deskGarden')) || {};
    this.soil        = data.soil        || 0;
    this.sprinkler   = data.sprinkler   || 0;
    this.potLevel    = data.potLevel    || 0;
    this.clouds      = data.clouds      || 0;
    this.waterClicks = data.waterClicks || 0;
    this.achieved    = data.achieved    || [];
    const lastTime   = data.lastTime     || Date.now();
    const ticks      = Math.floor((Date.now() - lastTime) / 5000);
    this.soil += ticks * (1 + this.sprinkler);

    // flower text (centered + vertical padding so the emoji never clips)
    this.plantText = this.add.text(w/2, h/2, '', {
      font:    '80px Arial',
      fill:    '#fff',
      align:   'center',
      padding: { x:0, y:100 }
    })
    .setOrigin(0.5)
    .setInteractive({ useHandCursor:true })
    .on('pointerdown', () => this._applyWater(true));
    this._updateFlower();

    // rain-cloud icon (hidden until you have ≥1 cloud)
    this.rainIcon = this.add.text(0, 0, '🌧️', { font:'32px Arial' })
      .setOrigin(0.5)
      .setVisible(false);

    // top-left UI
    this.soilText = this.add.text(10, 10, '', {
      font:'18px Arial', fill:'#fff',
      backgroundColor:'#000', padding:{ x:6, y:4 }
    });
    this.rateText = this.add.text(10, 50, '', {
      font:'16px Arial', fill:'#fff',
      backgroundColor:'#000', padding:{ x:6, y:4 }
    });

    // achievements panel
    this.achTexts = this.achDefs.map((a,i) => {
      return this.add.text(10, 90 + i*24, a.text, {
        font:'16px Arial', fill:'#888'
      });
    });
    this._refreshAchievements();

    // bottom-left clock
    this.clockText = this.add.text(10, h-10, '', {
      font:'24px Arial', fill:'#fff'
    }).setOrigin(0,1);
    this._updateClock();
    this.time.addEvent({
      delay:1000, loop:true,
      callback:this._updateClock, callbackScope:this
    });

    // right-side buttons
    const btnCfg = { font:'16px Arial', fill:'#fff', padding:{ x:10, y:5 } };
    const makeBtn = (y,label,bg,cb) => this.add.text(w-10, y, label, {
      ...btnCfg, backgroundColor:bg
    })
    .setOrigin(1,0)
    .setInteractive({ useHandCursor:true })
    .on('pointerdown', cb);

    this.waterBtn     = makeBtn(50,  '', '#060',  ()=> this._applyWater(true));
    this.sprinklerBtn = makeBtn(90,  '', '#036',  ()=> this._buySprinkler());
    this.potBtn       = makeBtn(130, '', '#660',  ()=> this._upgradePot());
    this.cloudBtn     = makeBtn(170, '', '#006',  ()=> this._buyCloud());
    this.resetBtn     = makeBtn(h-10,'🔄 Reset Data','#600',()=>{
      localStorage.removeItem('deskGarden');
      this.scene.restart();
    }).setOrigin(1,1);

    // passive income + cloud auto-water every 5s
    this.time.addEvent({
      delay:5000, loop:true,
      callback:()=>{
        // sprinklers
        this.soil += 1 + this.sprinkler;
        // NEW – show popup when clouds water, too
        for(let i=0;i<this.clouds;i++){
          this._applyWater(true);
        }
        this.save();
        this._updateUI();
        this._updateRain();
      }
    });

    // initial UI draw
    this._updateUI();
    this._updateRain();
  }

  // reposition on resize
  onResize({ width:w, height:h }) {
    this.bg.setDisplaySize(w, h);
    this.plantText.setPosition(w/2, h/2);
    this.waterBtn    .setPosition(w-10, 50);
    this.sprinklerBtn.setPosition(w-10, 90);
    this.potBtn      .setPosition(w-10, 130);
    this.cloudBtn    .setPosition(w-10, 170);
    this.resetBtn    .setPosition(w-10, h-10);
    this.clockText   .setPosition(10,    h-10);
    this.achTexts.forEach((t,i) => t.setPosition(10, 90 + i*24));
    this._updateRain();
  }

  // water logic (showPopup? bloom + "+N")
  _applyWater(showPopup) {
    const power = 1 + this.potLevel;
    this.soil += power;
    this.waterClicks++;
    if (showPopup) {
      // bloom tween
      this.tweens.add({
        targets: this.plantText,
        scale:   { from:1, to:1.2 },
        duration:200, yoyo:true
      });
      // +power popup
      const pop = this.add.text(
        this.plantText.x,
        this.plantText.y - 60,
        `+${power}`, { font:'24px Arial', fill:'#00bbff' }
      ).setOrigin(0.5);
      this.tweens.add({
        targets: pop, y: pop.y - 30, alpha: 0,
        duration:800, ease:'Power1',
        onComplete: ()=> pop.destroy()
      });
    }
    this._updateFlower();
    this._checkAchievements();
    this.save();
    this._updateUI();
    this._updateRain();
  }

  // cycle emoji stage
  _updateFlower() {
    const idx = Math.floor(this.waterClicks/5) % this.flowerStages.length;
    this.plantText.setText(this.flowerStages[idx]).setScale(1);
  }

  // buy sprinkler
  _buySprinkler() {
    const cost = (this.sprinkler+1)*10;
    if (this.soil >= cost) {
      this.soil   -= cost;
      this.sprinkler++;
      this.save();
      this._checkAchievements();
      this._updateUI();
    }
  }

  // upgrade pot
  _upgradePot() {
    const cost = (this.potLevel+1)*20;
    if (this.soil >= cost) {
      this.soil    -= cost;
      this.potLevel++;
      this.save();
      this._checkAchievements();
      this._updateUI();
    }
  }

  // buy cloud
  _buyCloud() {
    const cost = (this.clouds+1)*50;
    if (this.soil >= cost) {
      this.soil   -= cost;
      this.clouds++;
      this.save();
      this._checkAchievements();
      this._updateUI();
      this._updateRain();
    }
  }

  // unlock achievements (by clicks or events)
  _checkAchievements() {
    this.achDefs.forEach((a,i) => {
      if (this.achieved.includes(a.key)) return;
      const byClick = a.clicks  && this.waterClicks >= a.clicks;
      const byEvent = a.event   && this[a.event]   > 0;
      if (byClick || byEvent) {
        this.achieved.push(a.key);
        this.achTexts[i].setFill('#ff0');
        this._showAchievement(a.text);
      }
    });
  }

  // banner pop for new achievement
  _showAchievement(msg) {
    const w = this.scale.width;
    const b = this.add.text(w/2, 40, msg, {
      font:'20px Arial', fill:'#fff',
      backgroundColor:'#444', padding:{ x:10, y:6 }
    }).setOrigin(0.5,0);
    this.tweens.add({
      targets: b, alpha:{ from:1, to:0 },
      delay:2000, duration:1000,
      onComplete: ()=> b.destroy()
    });
  }

  // gray/unlocked coloring
  _refreshAchievements() {
    this.achTexts.forEach((t,i)=>{
      t.setFill(this.achieved.includes(this.achDefs[i].key) ? '#ff0' : '#888');
    });
  }

  // update all UI & button texts
  _updateUI() {
    this.soilText.setText(`Soil: ${this.soil}`);
    const rate = ((1 + this.sprinkler)/5).toFixed(2);
    this.rateText.setText(`Rate: ${rate} soil/sec`);
    this.waterBtn    .setText(`💧 Water (+${1+this.potLevel})`);
    this.sprinklerBtn.setText(`🌱 Buy Sprinkler (${(this.sprinkler+1)*10})`);
    this.potBtn      .setText(`🪴 Upgrade Pot (${(this.potLevel+1)*20})`);
    this.cloudBtn    .setText(`☁️ Buy Cloud (${(this.clouds+1)*50})`);
  }

  // show or hide the rain icon above the plant
  _updateRain() {
    if (this.clouds > 0) {
      this.rainIcon.setVisible(true);
      this.rainIcon.setPosition(
        this.plantText.x,
        this.plantText.y - this.plantText.height/2 - 20
      );
    } else {
      this.rainIcon.setVisible(false);
    }
  }

  // update real-time clock
  _updateClock() {
    const now = new Date();
    const hh  = String(now.getHours  ()).padStart(2,'0');
    const mm  = String(now.getMinutes()).padStart(2,'0');
    const ss  = String(now.getSeconds()).padStart(2,'0');
    this.clockText.setText(`Time: ${hh}:${mm}:${ss}`);
  }

  // persist everything
  save() {
    localStorage.setItem('deskGarden', JSON.stringify({
      soil:        this.soil,
      sprinkler:   this.sprinkler,
      potLevel:    this.potLevel,
      clouds:      this.clouds,
      waterClicks: this.waterClicks,
      achieved:    this.achieved,
      lastTime:    Date.now()
    }));
  }
}

// 3) Launch Phaser
const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: 0x000000,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [ PreloadScene, MainScene ]
};

new Phaser.Game(config);