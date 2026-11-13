plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val appBaseUrl = providers.gradleProperty("APP_BASE_URL")
    .orElse(providers.environmentVariable("APP_BASE_URL"))
    .getOrElse("")
val supabaseUrl = providers.gradleProperty("SUPABASE_URL")
    .orElse("https://yeixbbhqckysjugtelix.supabase.co")
    .get()
val supabasePublishableKey = providers.gradleProperty("SUPABASE_ANON_KEY")
    .orElse(providers.environmentVariable("SUPABASE_ANON_KEY"))
    .orElse("sb_publishable_nusBgj_nRwmKaJ2iHGo0aA_wUjYW_Gw")
    .get()

fun buildConfigString(value: String): String {
    val escaped = value.replace("\\", "\\\\").replace("\"", "\\\"")
    return "\"${escaped}\""
}

android {
    namespace = "lk.privatebus.drivergps"
    compileSdk = 35
    defaultConfig {
        applicationId = "lk.privatebus.drivergps"
        minSdk = 26
        targetSdk = 35
        versionCode = 2
        versionName = "1.0.1"
        buildConfigField("String", "APP_BASE_URL", buildConfigString(appBaseUrl))
        buildConfigField("String", "SUPABASE_URL", buildConfigString(supabaseUrl))
        buildConfigField("String", "SUPABASE_ANON_KEY", buildConfigString(supabasePublishableKey))
    }
    buildFeatures { buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.security:security-crypto:1.1.0")
    implementation("com.google.android.gms:play-services-location:21.3.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
