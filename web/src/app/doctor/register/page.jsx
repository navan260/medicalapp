"use strict";
import { useState, useEffect } from "react";
import WalletConnect from "@/components/WalletConnect";
import { getCurrentAccount } from "@/utils/contract";
import { db } from "@/utils/firebase";
import { ref, set, get, child } from "firebase/database";

export default function DoctorRegister() {
    const [account, setAccount] = useState(null);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        name: "",
        profession: "",
        hospital: "",
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        init();
    }, []);

    const init = async () => {
        try {
            const current = await getCurrentAccount();
            if (!current) {
                // Handle no account
            }
            setAccount(current);

            if (current) {
                // Check if already registered/pending
                const dbRef = ref(db);
                const snapshot = await get(child(dbRef, `doctors/${current.toLowerCase()}`));

                if (snapshot.exists()) {
                    // If already exists, we might want to show status or pre-fill
                    console.log("Existing application found:", snapshot.val());
                    if (snapshot.val().status === "pending") {
                        setSuccess(true); // Show pending state immediately if returning
                    }
                }
            }

        } catch (err) {
            console.error("Init error:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!account) {
            setError("Please connect your wallet");
            return;
        }

        try {
            setSubmitting(true);
            setError(null);

            // Save to Database
            await set(ref(db, 'doctors/' + account.toLowerCase()), {
                ...formData,
                walletAddress: account.toLowerCase(),
                status: "pending",
                createdAt: new Date().toISOString(),
            });

            setSuccess(true);
        } catch (err) {
            console.error("Registration error:", err);
            setError("Failed to submit application: " + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const goBack = () => {
        if (typeof window !== 'undefined') window.location.href = '/dashboard';
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Application Submitted!</h2>
                    <p className="text-gray-600 mb-6">
                        Your application to join as a doctor has been submitted successfully.
                        An admin will verify your details shortly.
                    </p>
                    <button
                        onClick={goBack}
                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium py-2 px-4 rounded-lg transition-colors"
                    >
                        Return to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={goBack}
                            className="text-gray-600 hover:text-gray-900"
                        >
                            <svg
                                className="w-6 h-6"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 19l-7-7 7-7"
                                />
                            </svg>
                        </button>
                        <h1 className="text-2xl font-bold text-gray-900">Doctor Registration</h1>
                    </div>
                    <WalletConnect />
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <div className="bg-white rounded-xl shadow-sm border p-8">
                    <div className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900">Professional Details</h2>
                        <p className="text-gray-500 text-sm mt-1">
                            Please provide your professional details for verification.
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
                            {error}
                        </div>
                    )}

                    {!account ? (
                        <div className="text-center py-8">
                            <p className="text-gray-600 mb-4">Please connect your wallet to register.</p>
                        </div>
                    ) : (

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Full Name
                                </label>
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="Dr. John Doe"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Profession / Specialization
                                </label>
                                <input
                                    type="text"
                                    name="profession"
                                    required
                                    value={formData.profession}
                                    onChange={handleChange}
                                    placeholder="Cardiologist, General Practitioner, etc."
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Hospital / Clinic
                                </label>
                                <input
                                    type="text"
                                    name="hospital"
                                    required
                                    value={formData.hospital}
                                    onChange={handleChange}
                                    placeholder="City General Hospital"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex justify-center items-center gap-2"
                                >
                                    {submitting ? (
                                        <>
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Submitting...
                                        </>
                                    ) : (
                                        "Submit for Verification"
                                    )}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </main>
        </div>
    );
}
