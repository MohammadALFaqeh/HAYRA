# تطبيق حيرة لأندرويد (TWA)

التطبيق غلاف صغير (~120KB) يفتح https://hayra-nine.vercel.app بملء الشاشة عبر Chrome،
وإن لم يوجد Chrome يستخدم WebView. أي تعديل على الموقع يصل للتطبيق تلقائيًا.

## ⚠️ مفتاح التوقيع
`hayra-release.jks` و `keystore.properties` (فيه كلمة السر) **غير مرفوعين** على GitHub.
احتفظ بنسخة احتياطية منهما — بدونهما لا يمكن إصدار تحديث للتطبيق نفسه،
ولن يعمل ملء الشاشة لأن بصمة المفتاح مسجلة في `public/.well-known/assetlinks.json`.

## البناء
الأدوات في `C:\Users\AMCT\android-tools` (JDK 17، Android SDK، Gradle 8.9).

```bash
cd android
export JAVA_HOME="C:/Users/AMCT/android-tools/jdk"
export ANDROID_HOME="C:/Users/AMCT/android-tools/sdk"
export GRADLE_USER_HOME="C:/Users/AMCT/android-tools/gradle-home"
"C:/Users/AMCT/android-tools/gradle/bin/gradle.bat" --no-daemon assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../public/hayra.apk
```

عند إصدار نسخة جديدة ارفع `versionCode` و `versionName` في `app/build.gradle`.
تحتاج إعادة البناء فقط إذا تغيّر الرابط أو الاسم أو الأيقونة — لا لتحديثات الموقع.
