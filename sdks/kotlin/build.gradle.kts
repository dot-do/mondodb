plugins {
    kotlin("jvm") version "1.9.21"
    kotlin("plugin.serialization") version "1.9.21"
    `java-library`
    `maven-publish`
}

group = "do.mongo"
artifactId = "sdk"
version = "0.1.0"

kotlin {
    jvmToolchain(17)
}

repositories {
    mavenCentral()
}

dependencies {
    // Kotlin
    implementation(kotlin("stdlib"))

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.3")

    // JSON serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.2")

    // Testing
    testImplementation(kotlin("test"))
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
    testImplementation("io.mockk:mockk:1.13.8")
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.1")
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
        showExceptions = true
        showCauses = true
        showStackTraces = true
    }
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
    kotlinOptions {
        freeCompilerArgs = listOf("-Xjsr305=strict", "-Xcontext-receivers")
    }
}

publishing {
    publications {
        create<MavenPublication>("maven") {
            groupId = "do.mongo"
            artifactId = "sdk"
            from(components["java"])

            pom {
                name.set("do.mongo Kotlin SDK")
                description.set("Kotlin SDK for do.mongo - MongoDB on the Edge with Coroutines")
                url.set("https://mongo.do")

                licenses {
                    license {
                        name.set("MIT License")
                        url.set("https://opensource.org/licenses/MIT")
                    }
                }

                developers {
                    developer {
                        id.set("dotdo")
                        name.set("do.mongo Team")
                        email.set("support@mongo.do")
                    }
                }

                scm {
                    connection.set("scm:git:git://github.com/dotdo/mongo.git")
                    developerConnection.set("scm:git:ssh://github.com/dotdo/mongo.git")
                    url.set("https://github.com/dotdo/mongo")
                }
            }
        }
    }
}
