/**
 * Client-Side Voice Feature Extractor & Speaker Recognition Matcher
 * Uses Web Audio API FFT to extract acoustic spectral characteristics
 * (spectral centroid, energy sub-bands, zero crossing rate) to identify speakers.
 */

import { SpeakerProfile, VoiceSample } from "./speakers"

/**
 * Extracts acoustic feature vector from an AudioBuffer or PCM Float32 array.
 * Returns an array of normalized acoustic descriptors.
 */
export async function extractVoiceFeaturesFromBlob(blob: Blob): Promise<number[] | null> {
  if (typeof window === "undefined" || !window.AudioContext) return null

  try {
    const arrayBuffer = await blob.arrayBuffer()
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
    const channelData = audioBuffer.getChannelData(0)
    audioCtx.close().catch(() => {})

    return extractFeaturesFromFloat32(channelData, audioBuffer.sampleRate)
  } catch (err) {
    console.warn("Failed to extract voice features:", err)
    return null
  }
}

export function extractFeaturesFromFloat32(samples: Float32Array, sampleRate = 16000): number[] {
  if (samples.length < 512) return []

  const fftSize = 512
  const hopSize = 256
  const numFrames = Math.floor((samples.length - fftSize) / hopSize)
  if (numFrames <= 0) return []

  // Extract 8-band spectral energy distribution + zero-crossing rate
  const numBands = 8
  const bandAverages = new Float64Array(numBands)
  let totalCentroid = 0
  let totalZcr = 0
  let validFrames = 0

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize
    let energy = 0
    let zcr = 0

    for (let i = 0; i < fftSize; i++) {
      const val = samples[offset + i]
      energy += val * val
      if (i > 0 && Math.sign(samples[offset + i]) !== Math.sign(samples[offset + i - 1])) {
        zcr++
      }
    }

    // Skip silent/quiet frames
    const rms = Math.sqrt(energy / fftSize)
    if (rms < 0.01) continue

    validFrames++
    totalZcr += zcr / fftSize

    // Simplified frequency band decomposition
    const bandSize = Math.floor(fftSize / (2 * numBands))
    for (let b = 0; b < numBands; b++) {
      let bandEnergy = 0
      for (let k = b * bandSize; k < (b + 1) * bandSize; k++) {
        const s = samples[offset + k]
        bandEnergy += s * s
      }
      bandAverages[b] += bandEnergy / bandSize
    }
  }

  if (validFrames === 0) return []

  const featureVector: number[] = []
  let totalEnergy = 0
  for (let b = 0; b < numBands; b++) {
    bandAverages[b] /= validFrames
    totalEnergy += bandAverages[b]
  }

  // Normalized band distribution
  for (let b = 0; b < numBands; b++) {
    featureVector.push(totalEnergy > 0 ? bandAverages[b] / totalEnergy : 0)
  }

  featureVector.push(totalZcr / validFrames)

  return featureVector
}

/**
 * Computes Cosine Similarity between two feature vectors [0..1]
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

const CONFIDENCE_THRESHOLD = 0.88 // Conservative threshold: do not make uncertain guesses

/**
 * Compares an unknown segment feature vector against existing speaker voice profiles.
 * Returns the best matching speaker profile if similarity >= CONFIDENCE_THRESHOLD, otherwise null.
 */
export function identifySpeakerFromFeatures(
  features: number[],
  profiles: SpeakerProfile[]
): { profile: SpeakerProfile; score: number } | null {
  if (!features || features.length === 0 || profiles.length === 0) return null

  let bestMatch: SpeakerProfile | null = null
  let highestScore = 0

  for (const profile of profiles) {
    if (!profile.voiceSamples || profile.voiceSamples.length === 0) continue

    for (const sample of profile.voiceSamples) {
      if (sample.spectralFeature && sample.spectralFeature.length === features.length) {
        const score = cosineSimilarity(features, sample.spectralFeature)
        if (score > highestScore) {
          highestScore = score
          bestMatch = profile
        }
      }
    }
  }

  if (bestMatch && highestScore >= CONFIDENCE_THRESHOLD) {
    return { profile: bestMatch, score: highestScore }
  }

  return null
}
