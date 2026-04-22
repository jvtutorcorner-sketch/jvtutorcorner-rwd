import React from 'react';

export function PaymentAppForm({
    paymentData,
    handlePaymentChange,
    selectedPaymentProvider,
    setSelectedPaymentProvider
}: any) {
    return (
        <>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    設定名稱 (僅供您辨識)
                </label>
                <input
                    type="text"
                    name="name"
                    value={paymentData.name}
                    onChange={handlePaymentChange}
                    placeholder="例如：我的綠界個人帳戶"
                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    required
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    選擇金流服務供應商 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                    <select
                        value={selectedPaymentProvider}
                        onChange={(e) => setSelectedPaymentProvider(e.target.value)}
                        className="w-full pl-4 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-green-500 focus:border-green-500 sm:text-sm rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    >
                        <option value="ECPAY">綠界科技 (ECPay)</option>
                        <option value="STRIPE">Stripe</option>
                        <option value="PAYPAL">PayPal</option>
                        <option value="LINEPAY">Line Pay</option>
                        <option value="JKOPAY">街口支付 (JkoPay)</option>
                    </select>
                </div>
            </div>

            {selectedPaymentProvider === 'ECPAY' && (
                <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            特店編號 (MerchantID) <span className="text-red-500">*</span>
                        </label>
                        <input type="text" name="ecpayMerchantId" value={paymentData.ecpayMerchantId} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            HashKey <span className="text-red-500">*</span>
                        </label>
                        <input type="text" name="ecpayHashKey" value={paymentData.ecpayHashKey} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            HashIV <span className="text-red-500">*</span>
                        </label>
                        <input type="text" name="ecpayHashIV" value={paymentData.ecpayHashIV} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                </div>
            )}

            {selectedPaymentProvider === 'STRIPE' && (
                <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Connect Account ID (選填)
                        </label>
                        <input type="text" name="stripeAccountId" value={paymentData.stripeAccountId} onChange={handlePaymentChange} placeholder="acct_1Ou..." className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Public Key <span className="text-red-500">*</span>
                        </label>
                        <input type="text" name="stripePublicKey" value={paymentData.stripePublicKey} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Secret Key <span className="text-red-500">*</span>
                        </label>
                        <input type="password" name="stripeSecretKey" value={paymentData.stripeSecretKey} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                </div>
            )}

            {selectedPaymentProvider === 'PAYPAL' && (
                <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Client ID <span className="text-red-500">*</span>
                        </label>
                        <input type="text" name="paypalClientId" value={paymentData.paypalClientId} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Secret Key <span className="text-red-500">*</span>
                        </label>
                        <input type="password" name="paypalSecretKey" value={paymentData.paypalSecretKey} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                </div>
            )}

            {selectedPaymentProvider === 'LINEPAY' && (
                <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Line Pay Channel ID <span className="text-red-500">*</span>
                        </label>
                        <input type="text" name="linePayChannelId" value={paymentData.linePayChannelId} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Line Pay Channel Secret <span className="text-red-500">*</span>
                        </label>
                        <input type="password" name="linePayChannelSecret" value={paymentData.linePayChannelSecret} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                </div>
            )}

            {selectedPaymentProvider === 'JKOPAY' && (
                <div className="space-y-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            街口特店編號 (Merchant ID) <span className="text-red-500">*</span>
                        </label>
                        <input type="text" name="jkopayMerchantId" value={paymentData.jkopayMerchantId} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            街口 Secret Key <span className="text-red-500">*</span>
                        </label>
                        <input type="password" name="jkopaySecretKey" value={paymentData.jkopaySecretKey} onChange={handlePaymentChange} className="w-full px-4 py-2 border border-gray-300 rounded-md dark:bg-gray-700 dark:border-gray-600" required />
                    </div>
                </div>
            )}
        </>
    );
}
