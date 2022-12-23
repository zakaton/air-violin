/* global AFRAME, THREE, Tone, PitchDetector */
AFRAME.registerSystem("air-violin", {
  schema: {
    leftHand: { type: "selector" },
    rightHand: { type: "selector" },
    side: { default: "left", oneOf: ["left", "right"] },
    modeText: { type: "selector" },
    violin: { type: "selector" },
    bow: { type: "selector" },
    camera: { type: "selector", default: "[camera]" },
  },
  init: function () {
    window.airViolin = this;

    // https://github.com/Tonejs/Tone.js/blob/r11/Tone/type/Frequency.js#L261
    this.A4 = 440;
    this.stringFrequencies = [
      [new Tone.Frequency("G3")],
      [new Tone.Frequency("D4")],
      [new Tone.Frequency("A4")],
      [new Tone.Frequency("E5")],
    ];
    this.stringFrequencies.forEach((stringFingerings) => {
      const openStringFrequency = stringFingerings[0];
      for (let index = 1; index <= 7; index++) {
        stringFingerings.push(openStringFrequency.transpose(index));
      }
    });
    this.noteToFingerings = {};
    this.stringFrequencies.forEach((stringFingerings, stringIndex) => {
      stringFingerings.forEach((frequency, fingerIndex) => {
        const note = frequency.toNote();
        this.noteToFingerings[note] = this.noteToFingerings[note] || [];
        this.noteToFingerings[note].push({ stringIndex, fingerIndex });
      });
    });
    Object.values(this.noteToFingerings).forEach((noteFingerings) =>
      noteFingerings.reverse()
    );

    this.otherSide = this.data.side == "left" ? "right" : "left";

    this.hand = this.data[`${this.data.side}Hand`];
    this.otherHand = this.data[`${this.otherSide}Hand`];
    
    this.hand.addEventListener("hand-tracking-extras-ready", (event) => {
      console.log(event)
      this.hand.jointsAPI = event.detail.data.jointAPI;
    });
    this.otherHand.addEventListener("hand-tracking-extras-ready", (event) => {
      this.otherHand.jointsAPI = event.detail.data.jointAPI;
    });

    this.violinModelEntity = this.data.violin.querySelector("[gltf-model]");

    this.frequency = new Tone.Frequency(440);

    this.audioContext = Tone.context.rawContext._nativeAudioContext;

    this.stringEntities = Array.from(
      this.data.violin.querySelectorAll("[data-string]")
    );
    this.fingerEntities = Array.from(
      this.data.violin.querySelectorAll("[data-finger]")
    );
    this.fretEntities = Array.from(
      this.data.violin.querySelectorAll("[data-fret]")
    );

    this.updateHighlightedFretIndex(0, false);

    this.fingerStringToFingerIndex = {
      0: 0,
      L1: 1,
      1: 2,
      L2: 3,
      2: 4,
      3: 5,
      H3: 6,
      4: 7,
    };
    // https://www.stringclub.com/learn-play/howls-moving-castle/
    this.songFingerings = [
      { string: 1, finger: 0 },
      { string: 1, finger: 3 },
      { string: 2, finger: "L1" },
      { string: 2, finger: 3 },
      { string: 2, finger: 3 },
      { string: 2, finger: "L2" },
      { string: 2, finger: "L1" },
      { string: 2, finger: 0 },
      { string: 2, finger: "L1" },

      { string: 1, finger: 3 },
      { string: 2, finger: "L1" },
      { string: 2, finger: 3 },
      { string: 3, finger: "L2" },
      { string: 3, finger: "L2" },
      { string: 3, finger: "L2" },
      { string: 3, finger: 3 },
      { string: 3, finger: "L1" },
      { string: 2, finger: "H3" },
      { string: 3, finger: "L1" },

      { string: 2, finger: 0 },
      { string: 2, finger: 3 },
      { string: 3, finger: "L1" },
      { string: 3, finger: 3 },
      { string: 3, finger: "L2" },
      { string: 3, finger: "L1" },
      { string: 3, finger: 0 },
      { string: 3, finger: "L1" },
      { string: 3, finger: "L2" },
      { string: 3, finger: "L1" },
      { string: 2, finger: 4 },

      { string: 2, finger: 3 },
      { string: 2, finger: "L2" },
      { string: 2, finger: "L1" },
      { string: 2, finger: "L2" },
      { string: 2, finger: 3 },
      { string: 2, finger: "L2" },
      { string: 1, finger: 3 },
      { string: 2, finger: 0 },
    ];
    this.songNotes = this.songFingerings.map(({ string, finger }) => {
      const fingerIndex = this.fingerStringToFingerIndex[finger];
      return this.stringFrequencies[string][fingerIndex];
    });

    this.modes = ["continuous", "notes", "perfect"];
    this.modeIndex = 0;
    this.onModeIndexUpdate();
    
    this.violinPitchOffset = 0.1
  },

  updateIndex: function (index, isOffset = true, currentIndex, values) {
    let newIndex = currentIndex;
    if (isNaN(index) && values.includes(index)) {
      newIndex = values.indexOf(index);
    } else {
      if (isOffset) {
        newIndex += index;
      } else {
        if (index >= 0 && index < values.length) {
          newIndex = index;
        }
      }
    }

    newIndex %= values.length;
    newIndex = THREE.MathUtils.clamp(newIndex, 0, values.length - 1);

    return newIndex;
  },
  updateMode: function (index, isOffset = true) {
    const newModeIndex = this.updateIndex(
      index,
      isOffset,
      this.modeIndex,
      this.modes
    );
    if (this.modeIndex != newModeIndex) {
      this.modeIndex = newModeIndex;
      this.onModeIndexUpdate();
    }
  },

  onModeIndexUpdate: function () {
    this.mode = this.modes[this.modeIndex];
    console.log("new mode:", this.mode);
    this.data.modeText.setAttribute("value", this.mode);

    switch (
      this.mode
      // FILL
    ) {
    }
  },

  isHandVisible: function (side) {
    const hand = side == this.data.side ? this.hand : this.otherHand;
    return hand.components["hand-tracking-controls"]?.mesh?.visible;
  },

  tick: function () {
    const isHandVisible = this.isHandVisible(this.data.side);
    if (isHandVisible) {
      this.showViolin();
      this.updateViolinRotation();
    } else {
      this.hideViolin();
    }

    const isOtherHandVisible = this.isHandVisible(this.otherSide);
    if (isOtherHandVisible) {
      this.showBow();
      this.updateBowRotation();
    } else {
      this.hideBow();
    }
  },
  setEntityVisibility: function (entity, visibility) {
    if (entity.object3D.visible != visibility) {
      entity.setAttribute("visible", visibility);
    }
  },
  showEntity: function (entity) {
    this.setEntityVisibility(entity, true);
  },
  hideEntity: function (entity) {
    this.setEntityVisibility(entity, false);
  },

  showViolin: function () {
    this.showEntity(this.data.violin);
  },
  hideViolin: function () {
    this.hideEntity(this.data.violin);
  },
  updateViolinRotation: function () {
    if (!this.hand.jointsAPI) {
      return;
    }
    
    this.violinPosition = this.violinPosition || new THREE.Vector3();
    this.handPosition = this.hand.jointsAPI.getWrist().getPosition();
    this.violinToHandVector = this.violinToHandVector || new THREE.Vector3();

    this.data.violin.object3D.getWorldPosition(this.violinPosition);
    this.violinToHandVector.subVectors(this.handPosition, this.violinPosition);
    
    this.cameraEuler = this.cameraEuler || new THREE.Euler();
    this.cameraEuler.x = -this.data.camera.object3D.rotation.x;
    this.cameraEuler.y = -this.data.camera.object3D.rotation.y;
    this.violinToHandVector.applyEuler(this.cameraEuler);
        
    this.spherical = this.spherical || new THREE.Spherical();
    this.spherical.setFromVector3(this.violinToHandVector);
    
    const pitch = Math.PI / 2 - this.spherical.phi;
    const yaw = this.spherical.theta + Math.PI;
    this.data.violin.object3D.rotation.x = pitch + this.violinPitchOffset;
    this.data.violin.object3D.rotation.y = yaw;
  },

  showBow: function () {
    this.showEntity(this.data.bow);
  },
  hideBow: function () {
    this.hideEntity(this.data.bow);
  },
  updateBowRotation: function () {
    // FILL
  },

  highlightString: function (index) {
    console.log("highlighting string", index);
    this.stringEntities.forEach((stringEntity, _index) => {
      //stringEntity.object3D.visible = index === _index;
      stringEntity.setAttribute("opacity", index === _index ? 1 : 0.6);
    });
  },
  showStrings: function () {
    this.stringEntities.forEach((stringEntity) => {
      //stringEntity.object3D.visible = true
      stringEntity.setAttribute("opacity", 1);
    });
  },
  clearStrings: function () {
    this.highlightString(-1);
  },

  highlightKnob: function (index, offset = 1) {
    this.knobEntities.forEach((knobEntity, _index) => {
      knobEntity.object3D.visible = index === _index;
      knobEntity.object3D.scale.x = Math.sign(offset);
    });
  },
  clearKnobs: function () {
    this.highlightKnob(-1);
  },

  setFretsVisibility: function (visible) {
    this.fretEntities.forEach((fretEntity) => {
      fretEntity.object3D.visible = visible;
    });
  },
  showFrets: function () {
    this.setFretsVisibility(true);
  },
  hideFrets: function () {
    this.setFretsVisibility(false);
  },
  highlightFret: function (index) {
    this.fretEntities.forEach((fretEntity, _index) => {
      fretEntity.setAttribute("color", index == _index ? "red" : "black");
    });
  },
  updateHighlightedFretIndex: function (index, isOffset = true) {
    const newHighlightedFretIndex = this.updateIndex(
      index,
      isOffset,
      this.highlightedFretIndex,
      this.fretEntities
    );
    if (this.highlightedFretIndex != newHighlightedFretIndex) {
      this.highlightedFretIndex = newHighlightedFretIndex;
      this.highlightedFret = this.fretEntities[this.highlightedFretIndex];
      this.highlightFret(this.highlightedFretIndex);
    }
  },
  getClosestStringIndex: function (pitch, fingerIndex = 0) {
    let closestString;
    let closestFrequency;
    let closestIndex = -1;

    this.stringFrequencies.forEach((stringFingerings, index) => {
      const stringFingering = stringFingerings[fingerIndex];
      const stringFingeringFrequency = stringFingering.toFrequency();
      if (
        closestIndex < 0 ||
        Math.abs(pitch - stringFingeringFrequency) <
          Math.abs(pitch - closestFrequency)
      ) {
        closestIndex = index;
        closestString = stringFingering;
        closestFrequency = stringFingeringFrequency;
      }
    });

    return closestIndex;
  },

  setText: function (text, value, color, clear) {
    if (value) {
      text.setAttribute("value", value);
      text.parentEl.setAttribute("visible", "true");
      if (color) {
        text.setAttribute("color", color);
      }
      if (clear) {
        this.clearText(text);
      }
    }
  },
  clearText: function (text) {
    //text.setAttribute("value", "");
    text.parentEl.setAttribute("visible", "false");
  },
  clearAllText: function () {
    // FILL
  },

  getPitchOffset: function (pitch) {
    // https://github.com/Tonejs/Tone.js/blob/r11/Tone/type/Frequency.js#L143
    const log = Math.log(pitch / this.A4) / Math.LN2;
    const offset = 12 * log - Math.round(12 * log);
    return offset;
  },
  pitchToPositions: function (pitch) {
    return this.noteToFingerings[this.pitchToNote(pitch)];
  },
  pitchToNote: function (pitch) {
    this.frequency._val = pitch;
    return this.frequency.toNote();
  },
  pitchToMidi: function (pitch) {
    this.frequency._val = pitch;
    return this.frequency.toMidi();
  },

  updateHighlightedSongNote: function (
    index,
    isOffset = true,
    override = false
  ) {
    const newSongNoteIndex = this.updateIndex(
      index,
      isOffset,
      this.songNoteIndex,
      this.songNotes
    );
    if (this.songNoteIndex != newSongNoteIndex || override) {
      this.songNoteIndex = newSongNoteIndex;
      this.highlightedSongNote = this.songNotes[this.songNoteIndex];
      console.log(
        "song note index",
        this.songNoteIndex,
        this.highlightedSongNote.toNote()
      );
      this.highlightSongNote();
    }
  },
  highlightSongNote: function () {
    const fingering =
      this.noteToFingerings[this.highlightedSongNote.toNote()][0];
    if (fingering) {
      console.log(fingering);
      const { stringIndex, fingerIndex } = fingering;
      this.fingerEntities.forEach((fingerEntity, index) => {
        const visible = fingerIndex !== 0 && index == stringIndex;
        if (visible) {
          fingerEntity.object3D.position.y =
            fingerIndex == 0
              ? 0
              : this.fretEntities[fingerIndex - 1].object3D.position.y;
        }
        fingerEntity.object3D.visible = visible;

        this.highlightString(stringIndex);
      });
    } else {
      console.log(
        "no fingering found for note",
        this.highlightedSongNote.toNote()
      );
    }
  },
  clearSongNotes: function () {
    this.fingerEntities.forEach((fingerEntity, index) => {
      fingerEntity.object3D.visible = false;
    });
  },
});
