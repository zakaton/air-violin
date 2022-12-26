// Audio Files
const notes = ["A3", "A4", "A5", "A6", "C4", "C5", "C6", "C7", "E4", "E5", "E6", "G3", "G4", "G5", "G6"]
const AUDIO = {};
notes.forEach(note => {
  AUDIO[note] = `./instruments/samples/violin/mp3/${note}.mp3`
})

export default class InstrumentViolinMp3 extends window.Tone.Sampler {
  constructor (options = {}) {
    super({
      urls: AUDIO,
      onload: options.onload
    });
  }
}
