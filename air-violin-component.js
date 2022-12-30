/* global AFRAME, THREE, Tone, PitchDetector, scale, instruments */
AFRAME.registerSystem("air-violin", {
  schema: {
    leftHand: { type: "selector" },
    rightHand: { type: "selector" },
    side: { default: "left", oneOf: ["left", "right"] },
    modeText: { type: "selector" },
    violin: { type: "selector" },
    bow: { type: "selector" },
    camera: { type: "selector", default: "[camera]" },
    curlThreshold: { type: "number", default: -0.7 },
    maxCurlThreshold: { type: "number", default: 0.3 },
    maxStrings: { type: "number", default: 4 },
    instrument: { type: "string", default: "wav" },
    scaleText: { type: "selector" },
  },
  init: function () {
    window.airViolin = this;
    
    this.extraNotes = ["E5"]

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

    this.instrumentClass = instruments.Violin.getByType(this.data.instrument);
    this.instruments = this.stringFrequencies.map(
      (_) => new this.instrumentClass()
    );
    this.pitchBends = this.instruments.map((instrument) => {
      const pitchBend = new Tone.PitchShift();
      instrument.connect(pitchBend);
      return pitchBend;
    });
    this.gains = this.pitchBends.map((pitchBend) => {
      const gain = new Tone.Gain(0).toDestination();
      pitchBend.connect(gain);
      return gain;
    });
    this.isPlaying = this.pitchBends.map((_) => false);
    this.bowMovementThreshold = 0.02;
    this.bowMovementMax = 0.7;

    this.throttledUpdateInstrument = this.instruments.map((_, index) => {
      return AFRAME.utils.throttle(this.updateInstrument.bind(this, index), 10);
    });
    this.otherSide = this.data.side == "left" ? "right" : "left";

    this.hand = this.data[`${this.data.side}Hand`];
    this.otherHand = this.data[`${this.otherSide}Hand`];

    this.hand.addEventListener("hand-tracking-extras-ready", (event) => {
      this.hand.jointsAPI = event.detail.data.jointAPI;
    });
    this.otherHand.addEventListener("hand-tracking-extras-ready", (event) => {
      this.otherHand.jointsAPI = event.detail.data.jointAPI;
    });
    this.numberOfPinches = 0;
    this.resetNumberOfPinches = AFRAME.utils.debounce(
      () => (this.numberOfPinches = 0),
      1000
    );
    this.onPinch = () => {
      if (this.isBowUsed) {
        return;
      }

      this.numberOfPinches++;
      if (this.numberOfPinches > 1) {
        this.updateMode(1);
        this.numberOfPinches = 0;
      }
      this.resetNumberOfPinches();
    };
    this.otherHand.addEventListener("pinchstarted", (event) => {
      this.onPinch();
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
    this.songNoteEntities = Array.from(
      this.data.violin.querySelectorAll("[data-song-note]")
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

    this.bowEntity = this.data.bow.querySelector("#bowEntity");
    this.isBowUsed = null;

    this.bowConnection = this.data.violin.querySelector(".bowConnection");

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

    this.modes = ["continuous", "notes", "scale", "perfect", "song"];
    this.modeIndex = 4;
    this.onModeIndexUpdate();

    this.violinPitchOffset = 0.1;

    this.fingerNotes = this.stringFrequencies.map(
      (frequencies) => new Tone.Frequency(frequencies[0].toFrequency())
    );
    this.isStringUsed = new Array(this.fingerNotes.length).fill(false);

    this.scale = scale;
    this.setScaleRoot("G");
    this.setScaleIsMajor(false);
  },
  updateScaleFrequencies: function () {
    this.setText(this.data.scaleText, this.scale.name);
    this.scaleFrequencies = this.stringFrequencies.map(
      (fingerFrequencies, stringIndex) =>
        fingerFrequencies
          .map((frequency, index) => {
            const note = frequency.toNote();
            const noteWithoutNumber = note.replace(/[0-9]/g, "");
            if (
              this.scale.keyToScales[noteWithoutNumber].includes(
                this.scale.name
              ) || this.extraNotes.includes(note)
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
      case "continuous":
      case "notes":
        this.hideEntity(this.data.scaleText.parentEl);
        break;
      case "scale":
      case "perfect":
      case "song":
        this.showEntity(this.data.scaleText.parentEl);
        break;
      default:
        break;
    }

    if (this.mode == "song") {
      this.updateHighlightedSongNote(0, false, true);
    } else {
      this.clearSongNotes();
    }
  },

  isHandVisible: function (side) {
    const hand = side == this.data.side ? this.hand : this.otherHand;
    return hand.components["hand-tracking-controls"]?.mesh?.visible;
  },

  tick: function (time, timeDelta) {
    const isHandVisible = this.isHandVisible(this.data.side);
    if (isHandVisible) {
      this.showEntity(this.data.violin);
      this.updateViolinRotation();
      this.updateFingerCurls();
      this.updateFingerNotes();
    } else {
      this.hideEntity(this.data.violin);
      this.isStringUsed.fill(false);
    }

    const isOtherHandVisible = this.isHandVisible(this.otherSide);
    if (isOtherHandVisible) {
      this.updateBowPosition();
      this.updateBowRotation();
      this.updateInstruments(time, timeDelta);
      this.showEntity(this.data.bow);
    } else {
      this.hideEntity(this.data.bow);
      this.clearInstruments();
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

    this.fingerCurls = this.fingerDirections.map((direction) => {
      const isFingerCurlingTowardsCamera =
        -direction.dot(this.normalizedViolinToHandVector) > 0;
      return isFingerCurlingTowardsCamera ? -direction.y : -1;
    });
  },
  updateFingerNotes: function () {
    let numberOfStringsUsed = 0;
    const previousIsStringUsed = this.isStringUsed.slice();

    this.fingerCurls.forEach((fingerCurl, fingerIndex) => {
      let useString = fingerCurl > this.data.curlThreshold;
      if (useString) {
        numberOfStringsUsed++;
      }

      this.isStringUsed[fingerIndex] = useString;
    });

    const maxStrings = this.mode == "song" ? 1 : this.data.maxStrings;
    if (numberOfStringsUsed > maxStrings) {
      const numberOfStringsToUnuse = numberOfStringsUsed - maxStrings;
      let numberOfStringsUnused = 0;
      for (
        let _fingerIndex = this.fingerCurls.length - 1;
        numberOfStringsUnused < numberOfStringsToUnuse && _fingerIndex >= 0;
        _fingerIndex--
      ) {
        if (
          !previousIsStringUsed[_fingerIndex] &&
          this.isStringUsed[_fingerIndex]
        ) {
          this.isStringUsed[_fingerIndex] = false;
          numberOfStringsUnused++;
        }
      }
    }

    this.fingerCurls.forEach((fingerCurl, fingerIndex) => {
      if (this.isStringUsed[fingerIndex]) {
        let interpolation = THREE.MathUtils.inverseLerp(
          this.data.curlThreshold,
          this.data.maxCurlThreshold,
          fingerCurl
        );
        interpolation = THREE.MathUtils.clamp(interpolation, 0, 1);
        this.updateFingerNote(interpolation, fingerIndex);

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
  updateFingerNote: function (interpolation, fingerIndex) {
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
        transposition = interpolation * (stringFrequencies.length - 1);
        if (this.mode == "notes") {
          transposition = Math.floor(transposition);
        }
        break;
      case "scale":
      case "perfect":
      case "song":
        {
          const scaleFrequencies = this.scaleFrequencies[fingerIndex];

          let scaleFrequencyIndex = 0;
          if (this.mode == "scale") {
            scaleFrequencyIndex = interpolation * (scaleFrequencies.length - 1);
          } else {
            let _scaleFrequencies = scaleFrequencies.slice();
            let foundPreviousFrequency = false;
            for (
              let _fingerIndex = fingerIndex - 1;
              /*!foundPreviousFrequency &&*/ _fingerIndex >= 0;
              _fingerIndex--
            ) {
              if (this.isStringUsed[_fingerIndex]) {
                foundPreviousFrequency = true;

                const _frequencyObject = this.fingerNotes[_fingerIndex];
                const midi = _frequencyObject.toMidi();
                const frequency = _frequencyObject.toFrequency();
                _scaleFrequencies = _scaleFrequencies.filter(
                  ({ frequency: scaleFrequencyObject }) => {
                    const _midi = scaleFrequencyObject.toMidi();
                    const semitones = (_midi - midi) % 12;
                    return semitones > 2;
                  }
                );
              }
            }

            let _scaleFrequencyIndex =
              interpolation * (_scaleFrequencies.length - 1);
            _scaleFrequencyIndex = Math.floor(_scaleFrequencyIndex);

            const _scaleFrequency = _scaleFrequencies[_scaleFrequencyIndex];
            scaleFrequencyIndex = scaleFrequencies.indexOf(_scaleFrequency);
          }

          scaleFrequencyIndex = Math.floor(scaleFrequencyIndex);
          const scaleFrequency = scaleFrequencies[scaleFrequencyIndex];
          if (scaleFrequency) {
            transposition = scaleFrequency.index;
          }
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

  updateBowPosition: function () {
    if (!this.otherHand.jointsAPI) {
      return;
    }
    const wristPosition = this.otherHand.jointsAPI.getWrist().getPosition();
    this.data.bow.object3D.position.copy(wristPosition);
  },
  updateBowRotation: function () {
    if (!this.otherHand.jointsAPI) {
      return;
    }

    let isBowUsed = this.isStringUsed.some(Boolean);

    if (!isBowUsed && this.isBowUsed !== isBowUsed) {
      this.defaultBowEuler =
        this.defaultBowEuler || new THREE.Euler(0, 1.1, -0.5);
      this.bowEntity.object3D.rotation.copy(this.defaultBowEuler);
    }

    const wristQuaternion = this.otherHand.jointsAPI.getWrist().getQuaternion();
    this.data.bow.object3D.quaternion.copy(wristQuaternion);

    if (isBowUsed) {
      this.worldBowPosition = this.worldBowPosition || new THREE.Vector3();
      this.bowEntity.object3D.getWorldPosition(this.worldBowPosition);
      this.bowConnectionPosition =
        this.bowConnectionPosition || new THREE.Vector3();
      this.bowConnection.object3D.getWorldPosition(this.bowConnectionPosition);

      this.bowToViolinVector = this.bowToViolinVector || new THREE.Vector3();
      this.bowToViolinVector.subVectors(
        this.bowConnectionPosition,
        this.worldBowPosition
      );

      this.bowSpherical = this.bowSpherical || new THREE.Spherical();
      this.bowSpherical.setFromVector3(this.bowToViolinVector);

      this.inverseWristQuaternion =
        this.inverseWristQuaternion || new THREE.Quaternion();
      this.inverseWristQuaternion.copy(wristQuaternion).invert();

      const pitch = Math.PI / 2 - this.bowSpherical.phi;
      const yaw = this.bowSpherical.theta + Math.PI;
      this.bowEuler = this.bowEuler || new THREE.Euler(0, 0, 0, "YXZ");
      this.bowEuler.set(pitch, yaw, 0);
      this.bowEntity.object3D.quaternion
        .setFromEuler(this.bowEuler)
        .premultiply(this.inverseWristQuaternion);
    }

    this.isBowUsed = isBowUsed;
  },

  updateInstruments: function (time, timeDelta) {
    this.instruments.forEach((instrument, index) => {
      const frequency = this.fingerNotes[index];
      let isRightNote = false;
      if (this.mode == "song") {
        isRightNote = frequency.toNote() == this.highlightedSongNote.toNote();
        if (isRightNote != instrument._isRightNote) {
          this.colorHighlightedSongNote(isRightNote ? "green" : "red");
          instrument._isRightNote = isRightNote;
        }
      }
    });

    if (this.isBowUsed) {
      const bowDistance = this.bowSpherical.radius;
      if (this.previousBowDistance) {
        const bowMovement =
          (1000 * Math.abs(bowDistance - this.previousBowDistance)) / timeDelta;
        if (bowMovement > this.bowMovementThreshold) {
          let gain = THREE.MathUtils.inverseLerp(
            this.bowMovementThreshold,
            this.bowMovementMax,
            bowMovement
          );
          gain = THREE.MathUtils.clamp(gain, 0, 2);

          this.instruments.forEach((instrument, index) => {
            const isPlaying = this.isPlaying[index];
            if (this.isStringUsed[index]) {
              const frequency = this.fingerNotes[index];
              let pitchBend;

              if (isPlaying) {
                const midiDifference =
                  this.getRawMidi(frequency.toFrequency()) - instrument._midi;
                if (this.mode == "continuous") {
                  pitchBend = midiDifference;
                } else {
                  if (Math.abs(midiDifference) >= 1) {
                    this.clearInstrument(index);
                    this.playInstrument(index, frequency, time);
                  }
                }
              } else {
                this.playInstrument(index, frequency, time);
              }
              this.throttledUpdateInstrument[index](gain, pitchBend);

              // FIX - wait for longer period
              if (instrument._isRightNote && gain > 0.3 && time - instrument._startTime > 300) {
                this.updateHighlightedSongNote(1, true);
                instrument._isRightNote = false;
              }
            } else {
              this.clearInstrument(index);
            }
          });
        } else {
          this.clearInstruments();
        }
      }
      this.previousBowDistance = bowDistance;
    } else {
      this.clearInstruments();
    }
  },
  getRawMidi: function (pitch) {
    // https://github.com/Tonejs/Tone.js/blob/f0bddd08ab091877e63cac2b9a5aa56be29a5a47/Tone/type/Frequency.js#L281
    return 69 + (12 * Math.log(pitch / this.A4)) / Math.LN2;
  },

  playInstrument: function (index, frequency, time) {
    if (!this.isPlaying[index]) {
      this.isPlaying[index] = true;
      const instrument = this.instruments[index];
      instrument.triggerAttack(frequency);
      instrument._midi = this.getRawMidi(frequency.toFrequency());
      instrument._startTime = time;
    }
  },
  clearInstrument: function (index) {
    if (this.isPlaying[index]) {
      this.isPlaying[index] = false;
      this.instruments[index].releaseAll(Tone.now());
      this.throttledUpdateInstrument[index](0, 0);
    }
  },
  clearInstruments: function () {
    this.instruments.forEach((_, index) => this.clearInstrument(index));
  },
  updateInstrument: function (index, gain, pitchBend) {
    if (this.isPlaying[index]) {
      if (gain !== undefined) {
        this.gains[index].gain.rampTo(gain);
      }
      if (pitchBend !== undefined) {
        this.pitchBends[index].pitch = pitchBend;
      }
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

  setText: function (text, value, color) {
    if (value) {
      text.setAttribute("value", value);
      this.showEntity(text.parentEl);
      if (color) {
        text.setAttribute("color", color);
      }
    }
  },

  setScaleIsMajor: function (isMajor) {
    this.scale.isMajor = isMajor;
    this.updateScaleFrequencies();
  },
  setScaleRoot: function (root) {
    this.scale.root = root;
    this.updateScaleFrequencies();
  },
  setScalePitch: function (pitch) {
    this.scale.pitch = pitch;
    this.updateScaleFrequencies();
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
      const { stringIndex, fingerIndex } = fingering;
      this.songNoteEntities.forEach((entity, index) => {
        const visible = index == stringIndex;
        if (visible) {
          this.highlightedSongNoteEntity = entity;
          this.colorHighlightedSongNote("red")
          entity.object3D.position.y =
            fingerIndex == 0
              ? 0
              : this.fretEntities[fingerIndex].object3D.position.y;
        }
        this.setEntityVisibility(entity, visible);
      });
    } else {
      console.log(
        "no fingering found for note",
        this.highlightedSongNote.toNote()
      );
    }
  },
  colorHighlightedSongNote: function (color) {
    if (this.highlightedSongNote) {
      const entity = this.highlightedSongNoteEntity;
      entity.setAttribute("color", color);
    }
  },
  clearSongNotes: function () {
    this.songNoteEntities.forEach((entity, index) => {
      entity.setAttribute("color", "red");
      this.hideEntity(entity);
    });
  },
});
