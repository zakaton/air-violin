/* global AFRAME, THREE, Tone, PitchDetector, scale */
AFRAME.registerSystem("air-violin", {
  schema: {
    leftHand: { type: "selector" },
    rightHand: { type: "selector" },
    side: { default: "left", oneOf: ["left", "right"] },
    modeText: { type: "selector" },
    violin: { type: "selector" },
    bow: { type: "selector" },
    camera: { type: "selector", default: "[camera]" },
    curlThreshold: { type: "number", default: 0 },
    maxStrings: { type: "number", default: 4 },
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
    this.noteEntities = Array.from(
      this.data.violin.querySelectorAll("[data-note]")
    );
    this.noteTextEntities = this.noteEntities.map((noteEntity) =>
      noteEntity.querySelector("a-text")
    );

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

    this.modes = ["continuous", "notes", "scale", "perfect"];
    this.modeIndex = 1;
    this.onModeIndexUpdate();

    this.violinPitchOffset = 0.1;

    this.fingerNotes = this.stringFrequencies.map(
      (frequencies) => new Tone.Frequency(frequencies[0].toFrequency())
    );
    this.isStringUsed = new Array(this.fingerNotes.length).fill(false);

    this.scale = scale;
    //this.scale.root = "D"
    this.updateScaleFrequencies();
  },
  updateScaleFrequencies: function () {
    this.scaleFrequencies = this.stringFrequencies.map(
      (fingerFrequencies, stringIndex) =>
        fingerFrequencies
          .map((frequency, index) => {
            const note = frequency.toNote();
            const noteWithoutNumber = note.replace(/[0-9]/g, "");
            if (
              this.scale.keyToScales[noteWithoutNumber].includes(
                this.scale.name
              )
            ) {
              return { frequency, index };
            }
          })
          .filter(Boolean)
    );
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

    switch (this.mode) {
      // FILL
      default:
        break;
    }
  },

  isHandVisible: function (side) {
    const hand = side == this.data.side ? this.hand : this.otherHand;
    return hand.components["hand-tracking-controls"]?.mesh?.visible;
  },

  tick: function () {
    const isHandVisible = this.isHandVisible(this.data.side);
    if (isHandVisible) {
      this.showEntity(this.data.violin);
      this.updateViolinRotation();
      this.updateFingerCurls();
      this.updateFingerNotes();
    } else {
      this.hideEntity(this.data.violin);
    }

    const isOtherHandVisible = this.isHandVisible(this.otherSide);
    if (isOtherHandVisible) {
      this.showEntity(this.data.bow);
      this.updateBowRotation();
    } else {
      this.hideEntity(this.data.bow);
    }
  },
  setEntityVisibility: function (entity, visibility) {
    if (entity.object3D.visible != visibility) {
      entity.setAttribute("visible", visibility);
    }
  },
  showEntity: function (entity) {
    this.setEntityVisibility(entity, "true");
  },
  hideEntity: function (entity) {
    this.setEntityVisibility(entity, "false");
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
    this.rotatedViolinToHandVector =
      this.rotatedViolinToHandVector || new THREE.Vector3();
    this.rotatedViolinToHandVector.copy(this.violinToHandVector);
    this.rotatedViolinToHandVector.applyEuler(this.cameraEuler);

    this.spherical = this.spherical || new THREE.Spherical();
    this.spherical.setFromVector3(this.rotatedViolinToHandVector);

    const pitch = Math.PI / 2 - this.spherical.phi;
    const yaw = this.spherical.theta + Math.PI;
    this.data.violin.object3D.rotation.x = pitch + this.violinPitchOffset;
    this.data.violin.object3D.rotation.y = yaw;
  },
  updateFingerCurls: function () {
    this.normalizedViolinToHandVector =
      this.normalizedViolinToHandVector || new THREE.Vector3();
    this.normalizedViolinToHandVector.copy(this.violinToHandVector).normalize();
    this.indexFingerDirection = this.hand.jointsAPI
      .getIndexTip()
      .getDirection();
    this.fingerDirections = [
      this.hand.jointsAPI.getIndexTip().getDirection(),
      this.hand.jointsAPI.getMiddleTip().getDirection(),
      this.hand.jointsAPI.getRingTip().getDirection(),
      this.hand.jointsAPI.getLittleTip().getDirection(),
    ];
    this.fingerCurls = this.fingerDirections.map(
      (direction) => -direction.dot(this.normalizedViolinToHandVector)
    );
  },
  updateFingerNotes: function () {
    let numberOfStringsUsed = 0;
    this.fingerCurls.forEach((fingerCurl, fingerIndex) => {
      let useString = fingerCurl > this.data.curlThreshold;
      if (useString) {
        if (numberOfStringsUsed < this.data.maxStrings) {
          numberOfStringsUsed++;
        } else {
          useString = false;
        }
      }

      this.isStringUsed[fingerIndex] = useString;
      if (useString) {
        const interpolation = THREE.MathUtils.inverseLerp(
          this.data.curlThreshold,
          1,
          fingerCurl - this.data.curlThreshold
        );
        this.updateFingerNote(fingerCurl, fingerIndex);

        this.showEntity(this.fingerEntities[fingerIndex]);
        this.showEntity(this.stringEntities[fingerIndex]);
        this.showEntity(this.noteEntities[fingerIndex]);
      } else {
        this.hideEntity(this.fingerEntities[fingerIndex]);
        this.hideEntity(this.stringEntities[fingerIndex]);
        this.hideEntity(this.noteEntities[fingerIndex]);
      }
    });
  },
  updateFingerNote: function (fingerCurl, fingerIndex) {
    const frequencyObject = this.fingerNotes[fingerIndex];

    const previousFrequency = frequencyObject.toFrequency();
    const previousNote = frequencyObject.toNote();

    const stringFrequencies = this.stringFrequencies[fingerIndex];
    const baseFrequency = stringFrequencies[0].toFrequency();
    frequencyObject._val = baseFrequency;

    let transposition = 0;
    switch (this.mode) {
      case "continuous":
      case "notes":
        transposition = fingerCurl * (stringFrequencies.length - 1);
        if (this.mode == "notes") {
          transposition = Math.floor(transposition);
        }
        break;
      case "scale":
      case "perfect":
        {
          const scaleFrequencies = this.scaleFrequencies[fingerIndex];
          const scaleIndex = Math.floor(
            fingerCurl * (scaleFrequencies.length - 1)
          );

          let scaleFrequencyIndex = 0;
          if (this.mode == "scale") {
            scaleFrequencyIndex = fingerCurl * (scaleFrequencies.length - 1);
          } else {
            // FILL
          }
          scaleFrequencyIndex = Math.floor(scaleFrequencyIndex);

          const scaleFrequency = scaleFrequencies[scaleFrequencyIndex];
          transposition = scaleFrequency.index;
        }
        break;
    }
    frequencyObject._val *= 2 ** (transposition / 12);

    if (Math.abs(frequencyObject.toFrequency() - previousFrequency) > 1) {
      const fingerEntity = this.fingerEntities[fingerIndex];
      const newFingerPosition = this.getFretPosition(transposition);
      fingerEntity.object3D.position.y = newFingerPosition;

      let showFingerPosition = transposition > 0;
      if (showFingerPosition) {
        this.showEntity(fingerEntity);
      } else {
        this.hideEntity(fingerEntity);
      }

      const newNote = frequencyObject.toNote();
      if (newNote != previousNote) {
        this.setText(this.noteTextEntities[fingerIndex], newNote);
      }
    }
  },

  getFretPosition: function (transposition) {
    const fromFretEntity = this.fretEntities[Math.floor(transposition)];
    const toFretEntity = this.fretEntities[Math.ceil(transposition)];

    const fromPosition = fromFretEntity.object3D.position.y;
    const toPosition = toFretEntity.object3D.position.y;

    return THREE.MathUtils.lerp(fromPosition, toPosition, transposition % 1);
  },

  updateBowRotation: function () {
    // FILL
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

  setText: function (text, value, color) {
    if (value) {
      text.setAttribute("value", value);
      this.showEntity(text.parentEl);
      if (color) {
        text.setAttribute("color", color);
      }
    }
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
