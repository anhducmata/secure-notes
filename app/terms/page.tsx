"use client"

import Link from "next/link"
import { ArrowLeft, Shield, Lock, Eye, Server } from "lucide-react"

export default function TermsPage() {
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
          <h1 className="text-3xl font-bold tracking-tight mb-3">Terms of Service</h1>
          <p className="text-gray-400 text-sm">Last updated: March 2026</p>
        </div>

        {/* Content */}
        <div className="space-y-8">
          <section>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-yellow-500" />
              Agreement to Terms
            </h2>
            <p className="text-gray-300 leading-relaxed">
              By accessing or using Notes, you agree to be bound by these Terms of Service. 
              If you do not agree to these terms, please do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Lock className="h-5 w-5 text-yellow-500" />
              End-to-End Encryption
            </h2>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <p>
                Notes uses client-side end-to-end encryption to protect your data. This means:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Your notes are encrypted on your device before being sent to our servers</li>
                <li>Your password is used as the encryption key and is never stored in plaintext</li>
                <li>We cannot read, access, or decrypt your notes under any circumstances</li>
                <li>Only you, with your password, can decrypt and view your notes</li>
              </ul>
              <div 
                className="p-4 rounded-lg mt-4"
                style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.2)" }}
              >
                <p className="text-yellow-500/90 text-sm font-medium">
                  Important: If you lose your password, we cannot recover your notes. 
                  There is no password recovery for your encrypted content because we do not have access to it.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Eye className="h-5 w-5 text-yellow-500" />
              What We Store
            </h2>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <p>We store only the following data:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Email address:</strong> For account identification and communication</li>
                <li><strong>Display name:</strong> For personalization</li>
                <li><strong>Hashed password:</strong> Securely hashed using bcrypt (never plaintext)</li>
                <li><strong>Encrypted notes:</strong> AES-256-GCM encrypted data that only you can decrypt</li>
                <li><strong>Note metadata:</strong> Encrypted timestamps for sorting purposes</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Server className="h-5 w-5 text-yellow-500" />
              What We Do NOT Store
            </h2>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Plaintext passwords</li>
                <li>Unencrypted note content</li>
                <li>Your encryption keys</li>
                <li>Any data that would allow us to read your notes</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">User Responsibilities</h2>
            <div className="space-y-4 text-gray-300 leading-relaxed">
              <p>As a user, you are responsible for:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Maintaining the security of your account credentials</li>
                <li>Remembering your password (we cannot recover encrypted data)</li>
                <li>Using the service in compliance with applicable laws</li>
                <li>Not using the service for any illegal or unauthorized purpose</li>
              </ul>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Service Availability</h2>
            <p className="text-gray-300 leading-relaxed">
              We strive to provide reliable service but do not guarantee uninterrupted access. 
              We may modify, suspend, or discontinue the service at any time with reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Limitation of Liability</h2>
            <p className="text-gray-300 leading-relaxed">
              Notes is provided &quot;as is&quot; without warranties of any kind. We are not liable for 
              any data loss resulting from forgotten passwords, as the encryption design means 
              we cannot recover your data.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Changes to Terms</h2>
            <p className="text-gray-300 leading-relaxed">
              We may update these terms from time to time. Continued use of the service after 
              changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-4">Contact</h2>
            <p className="text-gray-300 leading-relaxed">
              If you have questions about these Terms, please contact us through the app.
            </p>
          </section>
        </div>

        {/* Footer links */}
        <div className="mt-12 pt-8 border-t border-gray-800 flex gap-6 text-sm">
          <Link href="/privacy" className="text-yellow-500 hover:text-yellow-400 transition-colors">
            Privacy Policy
          </Link>
          <Link href="/" className="text-gray-400 hover:text-white transition-colors">
            Back to Notes
          </Link>
        </div>
      </div>
    </div>
  )
}
