plugins {
    id("com.android.application")
}

// Versioning can be overridden from the command line: -PversionCode=5 -PversionName=0.3.0
val vCode = (project.findProperty("versionCode") as String?)?.toInt() ?: 2
val vName = (project.findProperty("versionName") as String?) ?: "0.2.0"

android {
    namespace = "de.dasbutterschnitzel.hafengold"
    compileSdk = 36

    defaultConfig {
        applicationId = "de.dasbutterschnitzel.hafengold"
        minSdk = 26
        targetSdk = 36
        versionCode = vCode
        versionName = vName
    }

    signingConfigs {
        // Shared test key so every test APK installs over the previous one. NOT for the Play Store.
        create("test") {
            storeFile = file("../keystore/hafengold-test.jks")
            storePassword = "hafengold-test"
            keyAlias = "test"
            keyPassword = "hafengold-test"
        }
        // Upload key for Google Play, provided via environment variables (never committed).
        val ks = System.getenv("HG_KEYSTORE")
        if (ks != null && file(ks).exists()) {
            create("upload") {
                storeFile = file(ks)
                storePassword = System.getenv("HG_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("HG_KEY_ALIAS") ?: "upload"
                keyPassword = System.getenv("HG_KEY_PASSWORD") ?: System.getenv("HG_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("test")
        }
        getByName("release") {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("upload") ?: signingConfigs.getByName("test")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
}
