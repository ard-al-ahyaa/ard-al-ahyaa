/* =========================================
   أرض الأحياء - حماية تحميل حساب الطالب
   auth-guard.js
========================================= */

(function () {
    "use strict";

    // قراءة بيانات المستخدم بأمان
    window.getSafeUserMetadata = function (user) {
        if (!user || typeof user !== "object") {
            return {};
        }

        return user.user_metadata || {};
    };

    // قراءة اسم المستخدم بأمان
    window.getSafeUserName = function (user) {
        const metadata = window.getSafeUserMetadata(user);

        return (
            metadata.full_name ||
            metadata.name ||
            user?.email ||
            "طالب"
        );
    };

    // الحصول على المستخدم الحالي بأمان
    window.getSafeCurrentUser = async function (supabaseClient) {
        try {
            if (!supabaseClient?.auth) {
                return {
                    user: null,
                    error: "Supabase client غير متصل"
                };
            }

            const { data, error } =
                await supabaseClient.auth.getSession();

            if (error) {
                return {
                    user: null,
                    error: error.message
                };
            }

            const user = data?.session?.user || null;

            return {
                user,
                metadata: window.getSafeUserMetadata(user),
                error: null
            };

        } catch (error) {
            console.error(
                "خطأ أثناء تحميل بيانات الحساب:",
                error
            );

            return {
                user: null,
                metadata: {},
                error: error.message
            };
        }
    };

})();
