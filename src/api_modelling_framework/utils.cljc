(ns api-modelling-framework.utils
  (:require [api-modelling-framework.model.document :as document]
            [api-modelling-framework.model.vocabulary :as v]
            [clojure.string :as string]
            [taoensso.timbre :as timbre
             #?(:clj :refer :cljs :refer-macros)
             [log]]))

(defn safe-str [x]
  (cond
    (string? x) x
    (keyword? x) (if (string/index-of (str x) "/")
                   (string/replace-first (str x) ":" "")
                   (name x))
    :else (str x)))

(defn ramlify [x]
  (cond
    (string? x) x
    (keyword? x) (safe-str x)
    (map? x) (->> x
                  (mapv (fn [[k v]] [(ramlify k) (ramlify v)]))
                  (sort (fn [[ka va] [kb vb]]
                          (if (and (string/starts-with? ka "/")
                                   (string/starts-with? kb "/"))
                            0
                            (if (string/starts-with? ka "/") 1 -1))))
                  (into {}))
    (coll? x) (mapv #(ramlify %) x)
    :else x))

(defn safe-value [x]
  (if (or (string? x) (keyword? x))
    (safe-str x)
    x))

(defn has-class? [m c]
  (let [types (flatten [(get m "@type")])]
    (->> types (some #(= % c)))))


(defn find-tag [source-map tag-id]
  (when (some? source-map)
    (->> (document/tags source-map)
         (filter #(= tag-id
                     (document/tag-id %)))
         first)))


(defn find-value [m property]
  (-> m (get property) first (get "@value")))

(defn find-link [m property]
  (-> m (get property) first (get "@id")))


(defn find-values [m property]
  (-> m (get property) (->> (map #(get % "@value")))))

(defn find-links [m property]
  (-> m (get property) (->> (map #(get % "@id")))))

(defn clean-nils [jsonld]
  (->> jsonld
       (map (fn [[k v]]
              (let [v (if (and (not (map? v))
                               (coll? v))
                        (filter some? v)
                        v)]
                (cond
                  (#{:get :post :put :patch
                     :head :options :delete} k) [k v]
                  (nil? v)                      nil
                  (and (coll? v) (empty? v))    nil
                  (and (map? v) (= v {}))       nil
                  :else                         [k v]))))
       (filter some?)
       (into {})))

(defn assoc-value [t m target property]
  (if (some? (property m))
    (assoc t target [{"@value" (safe-value (property m))}])
    t))

(defn assoc-link [t m target property]
  (if (some? (property m))
    (assoc t target [{"@id" (property m)}])
    t))

(defn assoc-values [t m target property]
  (if (some? (property m))
    (assoc t target (map (fn [v] {"@value" (safe-value v)}) (property m)))
    t))

(defn map-values [m property]
  (if (some? (property m))
    (map (fn [v] {"@value" (safe-value v)}) (property m))
    []))

(defn assoc-object [t m target property mapping]
  (if (some? (property m))
    (assoc t target [(mapping (property m))])
    t))

(defn assoc-objects [t m target property mapping]
  (if (some? (property m))
    (assoc t target (map #(mapping %) (property m)))
    t))

(defn extract-nested-resources [node]
  (->> node
       (filter (fn [[k v]]
                 (string/starts-with? (str k) ":/")))
       (map (fn [[k v]]
              {:path (-> k str (string/replace-first ":/" "/"))
               :resource v}))))

(defn extract-jsonld-literal
  ([node property f]
   (let [value (-> node (get property []) first (get "@value"))]
     (if (some? value) (f value) nil)))
  ([node property] (extract-jsonld-literal node property identity)))

(defn extract-jsonld
  ([node property f]
   (let [value (-> node (get property []) first)]
     (if (some? value) (f value) nil)))
  ([node property] (extract-jsonld node property identity)))