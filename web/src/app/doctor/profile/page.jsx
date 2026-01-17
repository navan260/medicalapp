"use client";

import { useState, useEffect } from "react";
import WalletConnect from "@/components/WalletConnect";
import { getCurrentAccount } from "@/utils/contract";
import { db } from "@/utils/firebase";
import { ref, get, child, update } from "firebase/database";

export default function DoctorProfile() {
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
                if (typeof window !== "undefined") {
                    window.location.href = "/";
                }
                return;
            }
            setAccount(current);

            // Fetch current details
            const dbRef = ref(db);
            const snapshot = await get(child(dbRef, `doctors/${current.toLowerCase()}`));

            if (snapshot.exists()) {
                const data = snapshot.val();
                setFormData({
                    name: data.name || "",
                    profession: data.profession || "",
                    hospital: data.hospital || ""
                });
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
            setSuccess(false);

            // Update Realtime Database
            const doctorRef = ref(db, `doctors/${account.toLowerCase()}`);
            await update(doctorRef, {
                name: formData.name,
                profession: formData.profession,
                hospital: formData.hospital
            });

            setSuccess(true);
        } catch (err) {
            console.error("Update error:", err);
            setError("Failed to update profile: " + err.message);
        } finally {
            setSubmitting(false);
        }
    };

    const goBack = () => {
        if (typeof window !== "undefined") {
            window.location.href = "/doctor";
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
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
                        <h1 className="text-2xl font-bold text-gray-900">
                            Edit Profile
                        </h1>
                    </div>
                    <WalletConnect />
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="bg-white rounded-xl shadow-sm border p-8">
                    <div className="mb-8">
                        <h2 className="text-xl font-semibold text-gray-900">Update Details</h2>
                        <p className="text-gray-500 text-sm mt-1">
                            Keep your professional information up to date.
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg mb-6">
                            {error}
                        </div>
                    )}

                    {success && (
                        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg mb-6">
                            Profile updated successfully!
                        </div>
                    )}

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

                        <div className="pt-4 flex gap-4">
                            <button
                                type="button"
                                onClick={goBack}
                                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-900 font-medium py-3 px-4 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-300 text-white font-medium py-3 px-4 rounded-lg transition-colors flex justify-center items-center gap-2"
                            >
                                {submitting ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        Updating...
                                    </>
                                ) : (
                                    "Save Changes"
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    );
}
