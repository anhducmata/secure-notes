"use client"

import Link from "next/link"
import { ArrowLeft, Shield, Database, Lock, Trash2, Share2 } from "lucide-react"

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-2xl px-6 py-12">
        {/* Back button */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Notes
        </Link>

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-3">Privacy Policy</h1>
          <p className="text-gray-400 text-sm">Last updated: March 2026</p>
        </div>

        {/* Privacy highlight box */}
        <div 
          className="p-6 rounded-xl mb-10"
          style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.2)" }}
        >
          <div className="flex items-start gap-4">
            <Shield className="h-8 w-8 text-yellow-500 shrink-0 mt-1" />
            <div>
              <h2 className="text-lg font-semibold text-yellow-500 mb-2">Zero-Knowledge Privacy</h2>
              <p className="text-gray-300 text-sm leading-relaxed">
                Notes is built with a zero-knowledge architecture. We never see, store, or have access 
                to your plaintext notes. Your data is encrypted on your device before it ever reaches 
                our servers, and only you hold the key to decrypt it.
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-yellow-500" />
              How Your Data is Protected
            </h2>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <p>
                We use industry-standard encryption to ensure your privacy:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>AES-256-GCM encryption:</strong> Your notes are encrypted with military-grade encryption</li>
                <li><strong>Client-side encryption:</strong> Encryption happens on your device, not our servers</li>
                <li><strong>Password-derived keys:</strong> Your password generates the encryption key using PBKDF2</li>
                <li><strong>Bcrypt password hashing:</strong> Your account password is hashed, never stored in plaintext</li>
                <li><strong>HTTPS everywhere:</strong> All data transmission is encrypted in transit</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Database className="h-5 w-5 text-yellow-500" />
              Data We Collect
            </h2>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <div className="overflow-hidden rounded-lg border border-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-900/50">
                      <th className="text-left p-3 font-medium">Data Type</th>
                      <th className="text-left p-3 font-medium">How It&apos;s Stored</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-800">
                      <td className="p-3">Email address</td>
                      <td className="p-3 text-gray-400">Plaintext (for login)</td>
                    </tr>
                    <tr className="border-b border-gray-800">
                      <td className="p-3">Display name</td>
                      <td className="p-3 text-gray-400">Plaintext (for personalization)</td>
                    </tr>
                    <tr className="border-b border-gray-800">
                      <td className="p-3">Password</td>
                      <td className="p-3 text-green-400">Hashed with bcrypt</td>
                    </tr>
                    <tr className="border-b border-gray-800">
                      <td className="p-3">Note titles</td>
                      <td className="p-3 text-green-400">Encrypted (AES-256-GCM)</td>
                    </tr>
                    <tr className="border-b border-gray-800">
                      <td className="p-3">Note content</td>
                      <td className="p-3 text-green-400">Encrypted (AES-256-GCM)</td>
                    </tr>
                    <tr>
                      <td className="p-3">Note timestamps</td>
                      <td className="p-3 text-green-400">Encrypted</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Share2 className="h-5 w-5 text-yellow-500" />
              One-Time Sharing
            </h2>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <p>
                When you share a note using the one-time share feature:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>The note content is temporarily stored for sharing purposes</li>
                <li>Share links expire after one view or 24 hours, whichever comes first</li>
                <li>Once viewed, the shared content is permanently deleted from our servers</li>
                <li>We do not track or log who views shared notes</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Data We Do NOT Collect</h2>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Your plaintext notes or their content</li>
                <li>Your encryption keys or plaintext passwords</li>
                <li>IP addresses or location data</li>
                <li>Device fingerprints or tracking identifiers</li>
                <li>Usage analytics or behavioral data</li>
                <li>Third-party cookies or advertising trackers</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Third-Party Services</h2>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <p>We use the following third-party services:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Upstash Redis:</strong> For encrypted data storage (they only see encrypted data)</li>
                <li><strong>Resend:</strong> For transactional emails (verification, password reset)</li>
                <li><strong>Vercel:</strong> For hosting (standard web server logs only)</li>
              </ul>
              <p className="mt-4">
                These services never have access to your unencrypted notes because encryption 
                happens on your device before data is transmitted.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-yellow-500" />
              Data Deletion
            </h2>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <p>
                You can delete your account and all associated data at any time. When you delete your account:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>All encrypted notes are permanently deleted</li>
                <li>Your account information is removed</li>
                <li>Session data is cleared</li>
                <li>This action is irreversible</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Your Rights</h2>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <p>You have the right to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Access your data (though we can only provide encrypted data)</li>
                <li>Delete your account and all data</li>
                <li>Export your notes (decrypted on your device)</li>
                <li>Know exactly what data we store about you</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Changes to This Policy</h2>
            <p className="text-gray-300 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any 
              significant changes via email or through the app. Continued use of the service 
              after changes constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Contact Us</h2>
            <p className="text-gray-300 leading-relaxed">
              If you have questions about this Privacy Policy or our privacy practices, 
              please contact us through the app.
            </p>
          </section>
        </div>

        {/* Footer links */}
        <div className="mt-12 pt-8 border-t border-gray-800 flex gap-6 text-sm">
          <Link href="/terms" className="text-yellow-500 hover:text-yellow-400 transition-colors">
            Terms of Service
          </Link>
          <Link href="/" className="text-gray-400 hover:text-white transition-colors">
            Back to Notes
          </Link>
        </div>
      </div>
    </div>
  )
}
