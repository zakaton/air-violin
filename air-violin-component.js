/* global AFRAME, THREE, Tone, PitchDetector */
AFRAME.registerSystem("air-violin", {
  schema: {
    leftHand: { type: "selector" },
    rightHand: { type: "selector" },
    side: { default: "left", oneOf: ["left", "right"] },
    modeText: { type: "selector" },
    violin: { type: "selector" },
    bow: { type: "selector" },
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
  },
  updateMode: function (index, isOffset = true) {
    let newModeIndex = this.modeIndex;
    if (this.modes.includes(index)) {
      newModeIndex = this.modes.indexOf(index);
    } else {
      if (isOffset) {
        newModeIndex += index;
      } else {
        if (index >= 0 && index < this.modes.length) {
          newModeIndex = index;
        }
      }
    }

    newModeIndex %= this.modes.length;
    newModeIndex = THREE.MathUtils.clamp(
      newModeIndex,
      0,
      this.modes.length - 1
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

    switch (this.mode) {
      // FILL
    }
  },

  tick: function () {
    
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
    let newHighlightedFretIndex = this.highlightedFretIndex;
    if (isOffset) {
      newHighlightedFretIndex += index;
    } else {
      if (index >= 0 && index < this.fretEntities.length) {
        newHighlightedFretIndex = index;
      }
    }

    newHighlightedFretIndex %= this.fretEntities.length;
    newHighlightedFretIndex = THREE.MathUtils.clamp(
      newHighlightedFretIndex,
      0,
      this.fretEntities.length - 1
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
        this.clearText(text)
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
    isOffset = false,
    override = false
  ) {
    let newSongNoteIndex = this.songNoteIndex;
    if (isOffset) {
      newSongNoteIndex += index;
    } else {
      if (index >= 0 && index < this.songNotes.length) {
        newSongNoteIndex = index;
      }
    }

    newSongNoteIndex %= this.songNotes.length;
    newSongNoteIndex = THREE.MathUtils.clamp(
      newSongNoteIndex,
      0,
      this.songNotes.length - 1
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
