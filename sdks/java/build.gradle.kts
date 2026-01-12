plugins {
    java
    `java-library`
    `maven-publish`
}

group = "do.mongo"
version = "0.1.0"

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
    withSourcesJar()
    withJavadocJar()
}

repositories {
    mavenCentral()
}

dependencies {
    // JSON processing
    implementation("com.google.code.gson:gson:2.10.1")

    // Logging (optional)
    implementation("org.slf4j:slf4j-api:2.0.9")

    // Testing
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.1")
    testImplementation("org.assertj:assertj-core:3.24.2")
    testImplementation("org.mockito:mockito-core:5.8.0")
    testImplementation("org.mockito:mockito-junit-jupiter:5.8.0")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
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

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
    options.compilerArgs.add("-parameters")
}

publishing {
    publications {
        create<MavenPublication>("maven") {
            from(components["java"])

            pom {
                name.set("do.mongo SDK")
                description.set("MongoDB SDK for do.mongo - MongoDB on the Edge")
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
